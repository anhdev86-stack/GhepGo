import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AddMessageDto, AdminListQueryDto, CreateComplaintDto, ResolveComplaintDto } from './complaints.dto.js';
import { deadlines, defaultPriority, describeRemaining, loadSlaPolicy, PRIORITY_LABEL, type ComplaintPriority, type SlaClock } from './sla.js';

export const CATEGORY_LABEL: Record<string, string> = {
  DRIVER_BEHAVIOR: 'Thái độ tài xế',
  CUSTOMER_BEHAVIOR: 'Thái độ khách hàng',
  ROUTE: 'Lộ trình / đi vòng',
  FARE: 'Giá cước',
  SAFETY: 'An toàn',
  LOST_ITEM: 'Quên đồ',
  PAYMENT: 'Thanh toán',
  OTHER: 'Khác',
};
const STATUS_LABEL: Record<string, string> = { OPEN: 'mới', IN_REVIEW: 'đang xử lý', RESOLVED: 'đã giải quyết', REJECTED: 'bị từ chối' };
const ACTIVE_STATUSES = ['OPEN', 'IN_REVIEW'] as const;
/** Re-notify an overdue case at most this often; escalate to every admin once past 2× the clock. */
const OVERDUE_RENOTIFY_MS = 4 * 3600_000;

const userLite = { select: { id: true, fullName: true, role: true } };
const detailInclude = {
  trip: { select: { id: true, pickupAddress: true, dropoffAddress: true, fare: true, status: true, completedAt: true, tripType: true } },
  reporter: { select: { id: true, fullName: true, role: true, phone: true } },
  againstUser: userLite,
  assignee: userLite,
  messages: { orderBy: { createdAt: 'asc' as const }, include: { author: userLite } },
};
const listInclude = {
  trip: { select: { pickupAddress: true, dropoffAddress: true, fare: true } },
  reporter: { select: { id: true, fullName: true, role: true, phone: true } },
  againstUser: userLite,
  assignee: userLite,
  _count: { select: { messages: true } },
};

/**
 * Complaints with SLA and ownership.
 *
 *  - Every case gets a priority (from its category) and two deadlines: first
 *    admin response and resolution. `sla.ts` holds the clocks.
 *  - New cases are auto-assigned to the admin with the lightest active load
 *    (COMPLAINT_AUTO_ASSIGN=false to disable). Admins can reassign.
 *  - A 5-minute sweep notifies the owner (or every admin when unowned) about
 *    cases past a deadline, and escalates to every admin past 2× the clock.
 */
@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);
  readonly policy: Record<ComplaintPriority, SlaClock>;
  readonly autoAssign: boolean;

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.policy = loadSlaPolicy();
    this.autoAssign = (config.get<string>('COMPLAINT_AUTO_ASSIGN') ?? 'true').toLowerCase() !== 'false';
  }

  // ---------------- helpers ----------------

  private async adminIds() {
    return (await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((a) => a.id);
  }

  /** Admin with the fewest active cases (ties → fewest ever assigned), or null when there is no admin. */
  private async pickAssignee(): Promise<string | null> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, createdAt: true, _count: { select: { complaintsAssigned: { where: { status: { in: [...ACTIVE_STATUSES] } } } } } },
      orderBy: { createdAt: 'asc' },
    });
    if (admins.length === 0) return null;
    admins.sort((a, b) => a._count.complaintsAssigned - b._count.complaintsAssigned);
    return admins[0].id;
  }

  /** Attach human-readable SLA state to a row. */
  decorate<T extends { status: string; priority: string; dueAt: Date; firstResponseDueAt: Date; firstResponseAt: Date | null; resolvedAt: Date | null }>(c: T, now = new Date()) {
    const active = (ACTIVE_STATUSES as readonly string[]).includes(c.status);
    const firstResponse = c.firstResponseAt
      ? { met: c.firstResponseAt <= c.firstResponseDueAt, at: c.firstResponseAt }
      : active
        ? { met: null, ...describeRemaining(c.firstResponseDueAt, now) }
        : { met: false, at: null };
    const resolution = c.resolvedAt
      ? { met: c.resolvedAt <= c.dueAt, at: c.resolvedAt }
      : active
        ? { met: null, ...describeRemaining(c.dueAt, now) }
        : { met: false, at: null };
    const overdue = active && ((!c.firstResponseAt && c.firstResponseDueAt < now) || c.dueAt < now);
    return { ...c, priorityLabel: PRIORITY_LABEL[c.priority as ComplaintPriority], sla: { firstResponse, resolution, overdue } };
  }

  // ---------------- customer / driver ----------------

  /** Customer or driver of the trip files a complaint; the other party is the counterpart. */
  async create(reporterId: string, dto: CreateComplaintDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { driver: { select: { userId: true } } },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    const isCustomer = trip.customerId === reporterId;
    const isDriver = trip.driver?.userId === reporterId;
    if (!isCustomer && !isDriver) throw new ForbiddenException('Bạn không tham gia chuyến đi này');
    if (!['COMPLETED', 'CANCELLED', 'IN_PROGRESS'].includes(trip.status)) {
      throw new BadRequestException('Chỉ khiếu nại chuyến đã bắt đầu hoặc đã kết thúc');
    }
    const open = await this.prisma.complaint.count({
      where: { tripId: dto.tripId, reporterId, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (open > 0) throw new BadRequestException('Bạn đã có khiếu nại đang xử lý cho chuyến này');

    const now = new Date();
    const priority = defaultPriority(dto.category);
    const assigneeId = this.autoAssign ? await this.pickAssignee() : null;
    const complaint = await this.prisma.complaint.create({
      data: {
        tripId: dto.tripId,
        reporterId,
        againstUserId: isCustomer ? (trip.driver?.userId ?? null) : trip.customerId,
        category: dto.category,
        description: dto.description,
        priority,
        ...deadlines(this.policy, priority, now),
        createdAt: now,
        assigneeId,
        assignedAt: assigneeId ? now : null,
      },
      include: detailInclude,
    });

    const admins = await this.adminIds();
    const title = `Khiếu nại mới (${PRIORITY_LABEL[priority].toLowerCase()}): ${CATEGORY_LABEL[dto.category]}`;
    const body = `${complaint.reporter.fullName} · ${trip.pickupAddress} → ${trip.dropoffAddress}`;
    await this.notifications.sendToUsers(
      admins.filter((id) => id !== assigneeId),
      { title, body: assigneeId ? `${body} · phân công cho ${complaint.assignee?.fullName}` : body, data: { screen: 'complaints', complaintId: complaint.id } },
    );
    if (assigneeId) {
      await this.notifications.sendToUser(assigneeId, {
        title: `Bạn được phân công: ${CATEGORY_LABEL[dto.category]}`,
        body: `${body} · phản hồi trong ${this.policy[priority].firstResponseMin} phút`,
        data: { screen: 'complaints', complaintId: complaint.id },
      });
    }
    return this.decorate(complaint, now);
  }

  async listMine(userId: string) {
    const rows = await this.prisma.complaint.findMany({
      where: { OR: [{ reporterId: userId }, { againstUserId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        trip: { select: { pickupAddress: true, dropoffAddress: true, fare: true } },
        reporter: userLite,
        _count: { select: { messages: true } },
      },
    });
    return rows.map((r) => this.decorate(r));
  }

  private async load(id: string, userId: string, role: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id }, include: detailInclude });
    if (!c) throw new NotFoundException('Không tìm thấy khiếu nại');
    if (role !== 'ADMIN' && c.reporterId !== userId && c.againstUserId !== userId) {
      throw new ForbiddenException('Không có quyền xem khiếu nại này');
    }
    return c;
  }

  async get(id: string, userId: string, role: string) {
    return this.decorate(await this.load(id, userId, role));
  }

  async addMessage(id: string, userId: string, role: string, dto: AddMessageDto) {
    const c = await this.load(id, userId, role);
    if (['RESOLVED', 'REJECTED'].includes(c.status)) throw new BadRequestException('Khiếu nại đã đóng');
    const now = new Date();
    await this.prisma.complaintMessage.create({ data: { complaintId: id, authorId: userId, body: dto.body, createdAt: now } });
    if (role === 'ADMIN') {
      // First admin word stops the first-response clock; an unowned case becomes theirs.
      await this.prisma.complaint.update({
        where: { id },
        data: {
          status: c.status === 'OPEN' ? 'IN_REVIEW' : undefined,
          firstResponseAt: c.firstResponseAt ?? now,
          assigneeId: c.assigneeId ?? userId,
          assignedAt: c.assigneeId ? undefined : now,
        },
      });
    }

    const author = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const recipients = new Set<string>();
    if (role === 'ADMIN') {
      recipients.add(c.reporterId);
      if (c.againstUserId) recipients.add(c.againstUserId);
    } else {
      // The owner hears about it; every admin does when nobody owns it yet.
      if (c.assigneeId) recipients.add(c.assigneeId);
      else (await this.adminIds()).forEach((a) => recipients.add(a));
      // the counterpart only joins the thread once an admin has engaged
      if (c.status === 'IN_REVIEW') {
        const other = c.reporterId === userId ? c.againstUserId : c.reporterId;
        if (other) recipients.add(other);
      }
    }
    recipients.delete(userId);
    await this.notifications.sendToUsers([...recipients], {
      title: `Khiếu nại ${CATEGORY_LABEL[c.category]}: tin nhắn mới`,
      body: `${author?.fullName ?? 'Người dùng'}: ${dto.body.slice(0, 120)}`,
      data: { screen: 'complaints', complaintId: id },
    });
    return this.get(id, userId, role);
  }

  // ---------------- admin ----------------

  async listAll(q: AdminListQueryDto, adminId: string) {
    const now = new Date();
    const where: Record<string, unknown> = {};
    if (q.status === 'ACTIVE') where.status = { in: [...ACTIVE_STATUSES] };
    else if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.assignee === 'me') where.assigneeId = adminId;
    else if (q.assignee === 'unassigned') where.assigneeId = null;
    else if (q.assignee) where.assigneeId = q.assignee;
    if (q.overdue === 'true' || q.overdue === '1') {
      where.status = { in: [...ACTIVE_STATUSES] };
      where.OR = [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }];
    }
    const rows = await this.prisma.complaint.findMany({
      where,
      // Postgres orders enums by declaration: LOW < NORMAL < HIGH < URGENT.
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }],
      include: listInclude,
    });
    return rows.map((r) => this.decorate(r, now));
  }

  /** Admins with their active / overdue load — for the assignment picker. */
  async staff() {
    const now = new Date();
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        _count: {
          select: {
            complaintsAssigned: { where: { status: { in: [...ACTIVE_STATUSES] } } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    const overdue = await this.prisma.complaint.groupBy({
      by: ['assigneeId'],
      where: { status: { in: [...ACTIVE_STATUSES] }, OR: [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] },
      _count: true,
    });
    const overdueBy = new Map(overdue.map((o) => [o.assigneeId, o._count]));
    return admins.map((a) => ({ id: a.id, fullName: a.fullName, phone: a.phone, active: a._count.complaintsAssigned, overdue: overdueBy.get(a.id) ?? 0 }));
  }

  async assign(id: string, adminId: string, assigneeId: string | null) {
    const c = await this.prisma.complaint.findUnique({ where: { id }, select: { id: true, status: true, category: true, assigneeId: true, trip: { select: { pickupAddress: true, dropoffAddress: true } } } });
    if (!c) throw new NotFoundException('Không tìm thấy khiếu nại');
    if (['RESOLVED', 'REJECTED'].includes(c.status)) throw new BadRequestException('Khiếu nại đã đóng');
    if (assigneeId) {
      const target = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
      if (!target || target.role !== 'ADMIN') throw new BadRequestException('Người được phân công phải là quản trị viên');
    }
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { assigneeId, assignedAt: assigneeId ? new Date() : null },
      include: detailInclude,
    });
    if (assigneeId && assigneeId !== adminId && assigneeId !== c.assigneeId) {
      await this.notifications.sendToUser(assigneeId, {
        title: `Bạn được phân công: ${CATEGORY_LABEL[c.category]}`,
        body: `${c.trip.pickupAddress} → ${c.trip.dropoffAddress}`,
        data: { screen: 'complaints', complaintId: id },
      });
    }
    return this.decorate(updated);
  }

  /** Re-prioritise: deadlines are recomputed from the original filing time. */
  async setPriority(id: string, priority: ComplaintPriority) {
    const c = await this.prisma.complaint.findUnique({ where: { id }, select: { status: true, createdAt: true } });
    if (!c) throw new NotFoundException('Không tìm thấy khiếu nại');
    if (['RESOLVED', 'REJECTED'].includes(c.status)) throw new BadRequestException('Khiếu nại đã đóng');
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { priority, ...deadlines(this.policy, priority, c.createdAt), overdueNotifiedAt: null },
      include: detailInclude,
    });
    return this.decorate(updated);
  }

  /** Admin decision. RESOLVED with refundAmount credits the customer's wallet (optionally charged to the driver). */
  async resolve(id: string, adminId: string, dto: ResolveComplaintDto) {
    const c = await this.prisma.complaint.findUnique({
      where: { id },
      include: { trip: { include: { driver: { select: { userId: true } } } } },
    });
    if (!c) throw new NotFoundException('Không tìm thấy khiếu nại');
    if (['RESOLVED', 'REJECTED'].includes(c.status)) throw new BadRequestException('Khiếu nại đã đóng');
    const refund = dto.status === 'RESOLVED' ? Math.round(dto.refundAmount ?? 0) : 0;
    if (refund > Number(c.trip.fare)) throw new BadRequestException('Số tiền hoàn vượt quá giá cước');
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (refund > 0) {
        await this.wallet.post(tx, c.trip.customerId, {
          type: 'REFUND',
          amount: refund,
          tripId: c.tripId,
          reference: c.id,
          description: `Hoàn tiền khiếu nại (${CATEGORY_LABEL[c.category]})`,
          allowNegative: true,
        });
        if (dto.chargeDriver && c.trip.driver) {
          await this.wallet.post(tx, c.trip.driver.userId, {
            type: 'ADJUSTMENT',
            amount: -refund,
            tripId: c.tripId,
            reference: c.id,
            description: `Trừ tiền do khiếu nại (${CATEGORY_LABEL[c.category]})`,
            allowNegative: true,
          });
        }
      }
      if (dto.resolution) {
        await tx.complaintMessage.create({ data: { complaintId: id, authorId: adminId, body: dto.resolution, createdAt: now } });
      }
      return tx.complaint.update({
        where: { id },
        data: {
          status: dto.status,
          resolution: dto.resolution,
          refundAmount: refund > 0 ? refund : undefined,
          resolvedAt: dto.status === 'IN_REVIEW' ? null : now,
          firstResponseAt: c.firstResponseAt ?? now,
          // "Nhận xử lý" on an unowned case makes it yours.
          assigneeId: c.assigneeId ?? adminId,
          assignedAt: c.assigneeId ? undefined : now,
        },
        include: detailInclude,
      });
    });

    const recipients = [c.reporterId, ...(c.againstUserId ? [c.againstUserId] : [])];
    await this.notifications.sendToUsers(recipients, {
      title: `Khiếu nại ${STATUS_LABEL[dto.status]}`,
      body:
        `${CATEGORY_LABEL[c.category]} · ${c.trip.pickupAddress} → ${c.trip.dropoffAddress}` +
        (refund > 0 ? ` · hoàn ${refund.toLocaleString('vi-VN')} đ vào ví khách` : '') +
        (dto.resolution ? ` · ${dto.resolution.slice(0, 100)}` : ''),
      data: { screen: 'complaints', complaintId: id },
    });
    return this.decorate(updated, now);
  }

  // ---------------- SLA reporting & sweep ----------------

  /** SLA attainment for complaints filed in [from, to] plus the live backlog. */
  async slaReport(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Khoảng thời gian không hợp lệ');
    const now = new Date();
    const rows = await this.prisma.complaint.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { priority: true, status: true, createdAt: true, firstResponseDueAt: true, firstResponseAt: true, dueAt: true, resolvedAt: true },
    });
    const responded = rows.filter((r) => r.firstResponseAt);
    const closed = rows.filter((r) => r.resolvedAt);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
    const byPriority = Object.fromEntries(
      (['URGENT', 'HIGH', 'NORMAL', 'LOW'] as ComplaintPriority[]).map((p) => {
        const set = rows.filter((r) => r.priority === p);
        const cl = set.filter((r) => r.resolvedAt);
        return [p, { total: set.length, resolvedWithinSla: pct(cl.filter((r) => r.resolvedAt! <= r.dueAt).length, cl.length) }];
      }),
    );
    const [openCount, overdueCount, unassigned] = await Promise.all([
      this.prisma.complaint.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
      this.prisma.complaint.count({ where: { status: { in: [...ACTIVE_STATUSES] }, OR: [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] } }),
      this.prisma.complaint.count({ where: { status: { in: [...ACTIVE_STATUSES] }, assigneeId: null } }),
    ]);
    return {
      range: { from: start, to: end },
      total: rows.length,
      responded: responded.length,
      resolved: closed.length,
      firstResponseWithinSlaPct: pct(responded.filter((r) => r.firstResponseAt! <= r.firstResponseDueAt).length, responded.length),
      resolvedWithinSlaPct: pct(closed.filter((r) => r.resolvedAt! <= r.dueAt).length, closed.length),
      avgFirstResponseMin: avg(responded.map((r) => (r.firstResponseAt!.getTime() - r.createdAt.getTime()) / 60_000)),
      avgResolveMin: avg(closed.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 60_000)),
      byPriority,
      backlog: { open: openCount, overdue: overdueCount, unassigned },
      policy: this.policy,
    };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    const lock = await this.redis.client.set('complaints:sweep', '1', 'EX', 240, 'NX');
    if (lock !== 'OK') return;
    try {
      await this.sweepOverdue();
    } catch (err) {
      this.logger.error(`sweepOverdue failed: ${(err as Error).message}`);
    }
  }

  /**
   * Notify owners about cases past a deadline. Each case is (re)notified at
   * most every OVERDUE_RENOTIFY_MS; once past twice its resolution clock the
   * whole admin team is told.
   */
  async sweepOverdue(now = new Date()) {
    const renotifyBefore = new Date(now.getTime() - OVERDUE_RENOTIFY_MS);
    const overdue = await this.prisma.complaint.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        OR: [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }],
        AND: [{ OR: [{ overdueNotifiedAt: null }, { overdueNotifiedAt: { lt: renotifyBefore } }] }],
      },
      include: { trip: { select: { pickupAddress: true, dropoffAddress: true } }, assignee: userLite },
    });
    if (overdue.length === 0) return { notified: 0, escalated: 0 };

    const admins = await this.adminIds();
    let escalated = 0;
    for (const c of overdue) {
      const responseLate = !c.firstResponseAt && c.firstResponseDueAt < now;
      const clock = this.policy[c.priority as ComplaintPriority];
      const escalate = c.dueAt.getTime() + clock.resolveMin * 60_000 < now.getTime();
      const remaining = describeRemaining(responseLate ? c.firstResponseDueAt : c.dueAt, now);
      const what = responseLate ? 'chưa phản hồi' : 'chưa giải quyết';
      const recipients = escalate || !c.assigneeId ? admins : [c.assigneeId];
      if (escalate) escalated++;
      await this.notifications.sendToUsers(recipients, {
        title: `${escalate ? 'Leo thang SLA' : 'Quá hạn SLA'}: ${CATEGORY_LABEL[c.category]} (${PRIORITY_LABEL[c.priority as ComplaintPriority].toLowerCase()})`,
        body: `${what}, ${remaining.text} · ${c.trip.pickupAddress} → ${c.trip.dropoffAddress}${c.assignee ? ` · người xử lý: ${c.assignee.fullName}` : ' · chưa phân công'}`,
        data: { screen: 'complaints', complaintId: c.id },
      });
      await this.prisma.complaint.update({ where: { id: c.id }, data: { overdueNotifiedAt: now } });
    }
    this.logger.log(`SLA sweep: ${overdue.length} overdue, ${escalated} escalated`);
    return { notified: overdue.length, escalated };
  }
}
