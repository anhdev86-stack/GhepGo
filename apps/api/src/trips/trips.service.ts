import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTripDto } from './dto/create-trip.dto.js';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto.js';
import { estimateDurationSecs, estimateFare, haversineDistanceMeters } from '../common/geo.util.js';
import { MatchingService } from '../matching/matching.service.js';

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
  ) {}

  async create(customerId: string, dto: CreateTripDto) {
    if (dto.tripType === 'SHARED') {
      return this.matchingService.matchOrCreateGroup(customerId, dto);
    }

    const distanceMeters = Math.round(
      haversineDistanceMeters(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng),
    );
    const fare = estimateFare(distanceMeters);
    const durationSecs = estimateDurationSecs(distanceMeters);

    return this.prisma.trip.create({
      data: {
        customerId,
        tripType: dto.tripType,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        distanceMeters,
        durationSecs,
        fare,
      },
    });
  }

  async findMine(customerId: string) {
    return this.prisma.trip.findMany({
      where: { customerId },
      orderBy: { requestedAt: 'desc' },
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        payment: true,
        ...groupInclude,
      },
    });
  }

  async findAvailableForDrivers() {
    return this.prisma.trip.findMany({
      where: { status: 'REQUESTED', driverId: null },
      orderBy: { requestedAt: 'asc' },
    });
  }

  async findMyDriverTrips(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return this.prisma.trip.findMany({
      where: { driverId: driver.id },
      orderBy: { requestedAt: 'desc' },
      include: { customer: true, payment: true, ...groupInclude },
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

    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
        driverId: driver.id,
        vehicleId: driver.vehicles[0].id,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
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
      await this.prisma.payment.upsert({
        where: { tripId },
        create: { tripId, amount: trip.fare, method: 'CASH', status: 'PENDING' },
        update: {},
      });
      await this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE' } });
    }

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
