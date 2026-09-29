import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AddMessageDto, CreateComplaintDto, ResolveComplaintDto } from './complaints.dto.js';

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

const detailInclude = {
  trip: { select: { id: true, pickupAddress: true, dropoffAddress: true, fare: true, status: true, completedAt: true, tripType: true } },
  reporter: { select: { id: true, fullName: true, role: true, phone: true } },
  againstUser: { select: { id: true, fullName: true, role: true } },
  messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, fullName: true, role: true } } } },
};

@Injectable()
export class ComplaintsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
  ) {}

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
      where: { tripId: dto.tripId, reporterId, status: { in: ['OPEN', 'IN_REVIEW'] } },
    });
    if (open > 0) throw new BadRequestException('Bạn đã có khiếu nại đang xử lý cho chuyến này');

    const complaint = await this.prisma.complaint.create({
      data: {
        tripId: dto.tripId,
        reporterId,
        againstUserId: isCustomer ? (trip.driver?.userId ?? null) : trip.customerId,
        category: dto.category,
        description: dto.description,
      },
      include: detailInclude,
    });

    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await this.notifications.sendToUsers(admins.map((a) => a.id), {
      title: `Khiếu nại mới: ${CATEGORY_LABEL[dto.category]}`,
      body: `${complaint.reporter.fullName} · ${trip.pickupAddress} → ${trip.dropoffAddress}`,
      data: { screen: 'complaints', complaintId: complaint.id },
    });
    return complaint;
  }

  async listMine(userId: string) {
    return this.prisma.complaint.findMany({
      where: { OR: [{ reporterId: userId }, { againstUserId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        trip: { select: { pickupAddress: true, dropoffAddress: true, fare: true } },
        reporter: { select: { id: true, fullName: true, role: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async listAll(status?: string) {
    return this.prisma.complaint.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        trip: { select: { pickupAddress: true, dropoffAddress: true, fare: true } },
        reporter: { select: { id: true, fullName: true, role: true, phone: true } },
        againstUser: { select: { id: true, fullName: true, role: true } },
        _count: { select: { messages: true } },
      },
    });
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
    return this.load(id, userId, role);
  }

  async addMessage(id: string, userId: string, role: string, dto: AddMessageDto) {
    const c = await this.load(id, userId, role);
    if (['RESOLVED', 'REJECTED'].includes(c.status)) throw new BadRequestException('Khiếu nại đã đóng');
    await this.prisma.complaintMessage.create({ data: { complaintId: id, authorId: userId, body: dto.body } });
    if (c.status === 'OPEN' && role === 'ADMIN') {
      await this.prisma.complaint.update({ where: { id }, data: { status: 'IN_REVIEW' } });
    }

    const author = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const recipients = new Set<string>();
    if (role === 'ADMIN') {
      recipients.add(c.reporterId);
      if (c.againstUserId) recipients.add(c.againstUserId);
    } else {
      const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
      admins.forEach((a) => recipients.add(a.id));
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
    return this.load(id, userId, role);
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
        await tx.complaintMessage.create({ data: { complaintId: id, authorId: adminId, body: dto.resolution } });
      }
      return tx.complaint.update({
        where: { id },
        data: {
          status: dto.status,
          resolution: dto.resolution,
          refundAmount: refund > 0 ? refund : undefined,
          resolvedAt: dto.status === 'IN_REVIEW' ? null : new Date(),
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
    return updated;
  }
}
