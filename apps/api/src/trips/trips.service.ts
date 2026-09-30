import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTripDto } from './dto/create-trip.dto.js';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto.js';
import { MatchingService } from '../matching/matching.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { GeoService } from '../geo/geo.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { PricingService } from '../pricing/pricing.service.js';

const NEXT_STATUS: Record<string, string[]> = {
  ACCEPTED: ['EN_ROUTE_TO_PICKUP', 'CANCELLED'],
  EN_ROUTE_TO_PICKUP: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
};

const groupInclude = { group: { include: { stops: { orderBy: { sequence: 'asc' as const } } } } };

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private matchingService: MatchingService,
    private publisher: RealtimePublisher,
    private geo: GeoService,
    private wallet: WalletService,
    private zones: ZonesService,
    private pricing: PricingService,
  ) {}

  async create(customerId: string, dto: CreateTripDto) {
    const area = await this.zones.checkTrip(
      { lat: dto.pickupLat, lng: dto.pickupLng },
      { lat: dto.dropoffLat, lng: dto.dropoffLng },
    );
    if (!area.ok) throw new BadRequestException(area.message);
    const pickupZoneId = area.pickupZone?.id ?? null;

    if (dto.tripType === 'SHARED') {
      return this.matchingService.matchOrCreateGroup(customerId, dto, pickupZoneId);
    }

    // Road distance from the map provider; Haversine-based fallback inside GeoService.
    const route = await this.geo.route([
      { lat: dto.pickupLat, lng: dto.pickupLng },
      { lat: dto.dropoffLat, lng: dto.dropoffLng },
    ]);
    const distanceMeters = route.distanceMeters;
    const durationSecs = route.durationSecs;
    // Same engine as GET /pricing/quote: rule per zone, live surge, promo (400 when the code cannot apply).
    const price = await this.pricing.priceForBooking({
      distanceMeters,
      durationSecs,
      tripType: 'PRIVATE',
      zoneId: pickupZoneId,
      promoCode: dto.promoCode,
      customerId,
    });
    const promo = price.promo && price.promo.valid ? price.promo : null;

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          customerId,
          tripType: dto.tripType,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          pickupZoneId,
          pickupAddress: dto.pickupAddress,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
          dropoffAddress: dto.dropoffAddress,
          dropoffLat: dto.dropoffLat,
          dropoffLng: dto.dropoffLng,
          distanceMeters,
          durationSecs,
          routePolyline: route.polyline ?? null,
          fare: price.total,
          surgeMultiplier: price.surgeMultiplier,
          discountAmount: price.discount,
          promoCode: promo?.code ?? null,
          fareBreakdown: { ...price.breakdown, ruleId: price.ruleId, ruleName: price.ruleName, subtotal: price.subtotal, discount: price.discount, total: price.total },
        },
      });
      if (promo) await this.pricing.redeem(tx, promo.id, customerId, created.id, price.discount);
      return created;
    });

    this.publisher.publish({
      type: 'trip.created',
      trip: {
        id: trip.id,
        tripType: trip.tripType,
        pickupAddress: trip.pickupAddress,
        dropoffAddress: trip.dropoffAddress,
        pickupLat: trip.pickupLat,
        pickupLng: trip.pickupLng,
        fare: trip.fare.toString(),
        distanceMeters: trip.distanceMeters,
      },
    });
    return trip;
  }

  async findMine(customerId: string) {
    return this.prisma.trip.findMany({
      where: { customerId },
      orderBy: { requestedAt: 'desc' },
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        payment: true,
        rating: true,
        complaints: { select: { id: true, status: true, category: true } },
        ...groupInclude,
      },
    });
  }

  /** Drivers assigned to a zone only see trips picking up in that zone. */
  async findAvailableForDrivers(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { zoneId: true } });
    return this.prisma.trip.findMany({
      where: { status: 'REQUESTED', driverId: null, ...this.zones.driverZoneFilter(driver?.zoneId ?? null) },
      orderBy: { requestedAt: 'asc' },
      include: { pickupZone: { select: { name: true } } },
    });
  }

  async findMyDriverTrips(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return this.prisma.trip.findMany({
      where: { driverId: driver.id },
      orderBy: { requestedAt: 'desc' },
      include: { customer: true, payment: true, complaints: { select: { id: true, status: true, category: true } }, ...groupInclude },
    });
  }

  async accept(userId: string, tripId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { vehicles: { where: { isActive: true }, take: 1 } },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    if (driver.vehicles.length === 0) {
      throw new BadRequestException('Bạn cần đăng ký xe trước khi nhận chuyến');
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.status !== 'REQUESTED' || trip.driverId) {
      throw new BadRequestException('Chuyến đi này đã được nhận hoặc không còn khả dụng');
    }
    if (!this.zones.driverAllowed(driver.zoneId, trip.pickupZoneId)) {
      throw new BadRequestException('Chuyến đi này nằm ngoài khu vực hoạt động của bạn');
    }

    // Atomic claim: only one driver can win a REQUESTED trip.
    const claimed = await this.prisma.trip.updateMany({
      where: { id: tripId, status: 'REQUESTED', driverId: null },
      data: {
        driverId: driver.id,
        vehicleId: driver.vehicles[0].id,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Chuyến đi này vừa được tài xế khác nhận');
    }
    await this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'ON_TRIP' } });

    const updated = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    this.publisher.publish({
      type: 'trip.updated',
      tripId,
      customerId: updated.customerId,
      driverUserId: userId,
      status: updated.status,
    });
    return updated;
  }

  async updateStatus(userId: string, tripId: string, dto: UpdateTripStatusDto) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('Không có quyền cập nhật chuyến đi này');
    }

    const allowedNext = NEXT_STATUS[trip.status] ?? [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${trip.status} sang ${dto.status}`,
      );
    }

    const now = new Date();
    const timestampField =
      dto.status === 'IN_PROGRESS'
        ? { startedAt: now }
        : dto.status === 'COMPLETED'
          ? { completedAt: now }
          : dto.status === 'CANCELLED'
            ? { cancelledAt: now }
            : {};

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: dto.status, ...timestampField },
    });

    if (dto.status === 'COMPLETED') {
      await this.wallet.settleTrip(tripId);
      await this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE' } });
    }
    if (dto.status === 'CANCELLED') {
      await this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE' } });
    }

    this.publisher.publish({
      type: 'trip.updated',
      tripId,
      customerId: updated.customerId,
      driverUserId: userId,
      status: updated.status,
      groupId: updated.groupId,
      ...(dto.status === 'CANCELLED' ? { reason: 'driver_cancelled' as const } : {}),
    });
    return updated;
  }

  /**
   * Customer cancels their own trip. Allowed until the driver has actually
   * picked them up (IN_PROGRESS). Shared trips are removed from their group
   * and the remaining route is re-optimised.
   */
  async cancelByCustomer(customerId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: { select: { userId: true, id: true } } },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.customerId !== customerId) throw new ForbiddenException('Không có quyền huỷ chuyến đi này');
    if (!['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE_TO_PICKUP'].includes(trip.status)) {
      throw new BadRequestException('Chuyến đi đã bắt đầu, không thể huỷ');
    }

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (trip.tripType === 'SHARED' && trip.groupId) {
      await this.matchingService.removeTripFromGroup(tripId);
    } else if (trip.driver) {
      await this.prisma.driver.update({ where: { id: trip.driver.id }, data: { status: 'AVAILABLE' } });
    }

    // A promo goes back to the pool; a late cancel (driver already on the way) may cost the rule's fee.
    await this.pricing.releaseRedemption(tripId);
    if (trip.driver && ['ACCEPTED', 'EN_ROUTE_TO_PICKUP'].includes(trip.status)) {
      const rule = await this.pricing.ruleFor(trip.pickupZoneId);
      if (rule.cancellationFee > 0) {
        await this.wallet.chargeCancellationFee(customerId, trip.driver.userId, tripId, rule.cancellationFee);
      }
    }

    this.publisher.publish({
      type: 'trip.updated',
      tripId,
      customerId,
      driverUserId: trip.driver?.userId ?? null,
      status: 'CANCELLED',
      groupId: trip.groupId,
      reason: 'customer_cancelled',
    });
    return updated;
  }

  async findOne(tripId: string, userId: string, role: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        customer: true,
        driver: { include: { user: true } },
        vehicle: true,
        payment: true,
        ...groupInclude,
      },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');

    const isOwner = trip.customerId === userId || trip.driver?.userId === userId;
    if (role !== 'ADMIN' && !isOwner) {
      throw new ForbiddenException('Không có quyền xem chuyến đi này');
    }

    return trip;
  }

  async findAll() {
    return this.prisma.trip.findMany({
      orderBy: { requestedAt: 'desc' },
      include: {
        customer: true,
        driver: { include: { user: true } },
        payment: true,
        ...groupInclude,
      },
    });
  }
}
