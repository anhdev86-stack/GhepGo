import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { CreateZoneDto, RateTripDto } from './fleet.dto.js';

function parseRange(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Khoảng thời gian không hợp lệ');
  }
  return { start, end };
}

/** Fleet operations: shifts, service zones, driver KPIs, ratings, admin reports. */
@Injectable()
export class FleetService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  // ---------------- shifts ----------------

  async startShift(driverId: string) {
    const active = await this.prisma.driverShift.findFirst({ where: { driverId, status: 'ACTIVE' } });
    if (active) return active;
    return this.prisma.driverShift.create({ data: { driverId } });
  }

  async endShift(driverId: string) {
    await this.prisma.driverShift.updateMany({
      where: { driverId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  }

  async myShifts(driverUserId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return this.prisma.driverShift.findMany({ where: { driverId: driver.id }, orderBy: { startedAt: 'desc' }, take: 30 });
  }

  // ---------------- zones ----------------

  listZones() {
    return this.prisma.serviceZone.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { drivers: true } } } });
  }

  createZone(dto: CreateZoneDto) {
    return this.prisma.serviceZone.create({ data: dto });
  }

  async assignZone(driverId: string, zoneId: string | null) {
    if (zoneId) {
      const zone = await this.prisma.serviceZone.findUnique({ where: { id: zoneId } });
      if (!zone) throw new NotFoundException('Không tìm thấy khu vực');
    }
    return this.prisma.driver.update({ where: { id: driverId }, data: { zoneId }, include: { zone: true } });
  }

  // ---------------- ratings ----------------

  async rateTrip(customerId: string, tripId: string, dto: RateTripDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { rating: true } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.customerId !== customerId) throw new ForbiddenException('Không phải chuyến của bạn');
    if (trip.status !== 'COMPLETED' || !trip.driverId) throw new BadRequestException('Chỉ đánh giá chuyến đã hoàn thành');
    if (trip.rating) throw new BadRequestException('Chuyến này đã được đánh giá');

    return this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.create({
        data: { tripId, driverId: trip.driverId!, customerId, score: dto.score, comment: dto.comment },
      });
      const agg = await tx.rating.aggregate({ where: { driverId: trip.driverId! }, _avg: { score: true }, _count: true });
      await tx.driver.update({
        where: { id: trip.driverId! },
        data: { ratingAvg: Math.round((agg._avg.score ?? 5) * 100) / 100, ratingCount: agg._count },
      });
      return rating;
    });
  }

  // ---------------- KPIs ----------------

  async driverStats(driverId: string, from?: string, to?: string) {
    const { start, end } = parseRange(from, to);
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { fullName: true, phone: true } }, zone: true },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');

    const where = { driverId, requestedAt: { gte: start, lte: end } };
    const [completed, cancelled, total, revenue, shifts, walletTx] = await Promise.all([
      this.prisma.trip.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.trip.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.trip.count({ where }),
      this.prisma.trip.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { fare: true, distanceMeters: true } }),
      this.prisma.driverShift.findMany({ where: { driverId, startedAt: { gte: start, lte: end } } }),
      this.prisma.wallet.findUnique({
        where: { userId: driver.userId },
        include: { transactions: { where: { createdAt: { gte: start, lte: end }, type: { in: ['TRIP_EARNING', 'COMMISSION'] } } } },
      }),
    ]);

    const onlineMs = shifts.reduce((s, sh) => s + ((sh.endedAt ?? new Date()).getTime() - sh.startedAt.getTime()), 0);
    const grossFare = Number(revenue._sum.fare ?? 0);
    const commissionPaid = walletTx?.transactions.filter((t) => t.type === 'COMMISSION').reduce((s, t) => s + Math.abs(Number(t.amount)), 0) ?? 0;
    const walletEarnings = walletTx?.transactions.filter((t) => t.type === 'TRIP_EARNING').reduce((s, t) => s + Number(t.amount), 0) ?? 0;

    return {
      driver: {
        id: driver.id,
        fullName: driver.user.fullName,
        phone: driver.user.phone,
        status: driver.status,
        ratingAvg: driver.ratingAvg,
        ratingCount: driver.ratingCount,
        zone: driver.zone?.name ?? null,
      },
      range: { from: start, to: end },
      trips: { total, completed, cancelled, cancelRate: total ? Math.round((cancelled / total) * 1000) / 10 : 0 },
      distanceKm: Math.round((revenue._sum.distanceMeters ?? 0) / 100) / 10,
      grossFare,
      /** what the driver keeps: fare − platform commission (regardless of cash/wallet) */
      netEarnings: Math.round(grossFare * (1 - this.wallet.commissionRate)),
      commissionPaid,
      walletEarnings,
      onlineHours: Math.round((onlineMs / 3600_000) * 10) / 10,
      tripsPerOnlineHour: onlineMs > 0 ? Math.round((completed / (onlineMs / 3600_000)) * 10) / 10 : 0,
      walletBalance: Number(walletTx?.balance ?? 0),
    };
  }

  async driverStatsByUser(userId: string, from?: string, to?: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return this.driverStats(driver.id, from, to);
  }

  /** Admin: revenue & operations overview with a per-day series. */
  async overview(from?: string, to?: string) {
    const { start, end } = parseRange(from, to);
    const completedWhere = { status: 'COMPLETED' as const, completedAt: { gte: start, lte: end } };

    const [byStatus, byType, fareAgg, paidAgg, daily, topDrivers, drivers, pendingWithdrawals] = await Promise.all([
      this.prisma.trip.groupBy({ by: ['status'], where: { requestedAt: { gte: start, lte: end } }, _count: true }),
      this.prisma.trip.groupBy({ by: ['tripType'], where: completedWhere, _count: true, _sum: { fare: true } }),
      this.prisma.trip.aggregate({ where: completedWhere, _sum: { fare: true, distanceMeters: true }, _count: true }),
      this.prisma.payment.groupBy({ by: ['method', 'status'], where: { trip: completedWhere }, _sum: { amount: true }, _count: true }),
      this.prisma.$queryRaw<{ day: Date; trips: number; fare: Prisma.Decimal }[]>`
        SELECT date_trunc('day', "completedAt") AS day, COUNT(*)::int AS trips, COALESCE(SUM(fare), 0) AS fare
        FROM trips WHERE status = 'COMPLETED' AND "completedAt" BETWEEN ${start} AND ${end}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.trip.groupBy({ by: ['driverId'], where: completedWhere, _count: true, _sum: { fare: true }, orderBy: { _sum: { fare: 'desc' } }, take: 10 }),
      this.prisma.driver.groupBy({ by: ['status'], _count: true }),
      this.prisma.withdrawal.aggregate({ where: { status: 'REQUESTED' }, _count: true, _sum: { amount: true } }),
    ]);

    const driverNames = await this.prisma.driver.findMany({
      where: { id: { in: topDrivers.map((d) => d.driverId).filter((x): x is string => !!x) } },
      select: { id: true, ratingAvg: true, user: { select: { fullName: true } } },
    });
    const nameById = new Map(driverNames.map((d) => [d.id, d]));
    const gross = Number(fareAgg._sum.fare ?? 0);

    return {
      range: { from: start, to: end },
      trips: {
        completed: fareAgg._count,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        byType: Object.fromEntries(byType.map((t) => [t.tripType, { count: t._count, fare: Number(t._sum.fare ?? 0) }])),
        distanceKm: Math.round((fareAgg._sum.distanceMeters ?? 0) / 100) / 10,
      },
      revenue: {
        grossFare: gross,
        platformCommission: Math.round(gross * this.wallet.commissionRate),
        driverPayout: gross - Math.round(gross * this.wallet.commissionRate),
        payments: paidAgg.map((p) => ({ method: p.method, status: p.status, count: p._count, amount: Number(p._sum.amount ?? 0) })),
      },
      daily: daily.map((d) => ({ day: d.day, trips: d.trips, fare: Number(d.fare) })),
      topDrivers: topDrivers.map((d) => ({
        driverId: d.driverId,
        fullName: nameById.get(d.driverId!)?.user.fullName ?? '?',
        ratingAvg: nameById.get(d.driverId!)?.ratingAvg ?? null,
        trips: d._count,
        fare: Number(d._sum.fare ?? 0),
      })),
      fleet: Object.fromEntries(drivers.map((d) => [d.status, d._count])),
      pendingWithdrawals: { count: pendingWithdrawals._count, amount: Number(pendingWithdrawals._sum.amount ?? 0) },
    };
  }
}
