import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { WalletService } from '../wallet/wallet.service.js';

const stopsInclude = { stops: { orderBy: { sequence: 'asc' as const } } };
const fullInclude = {
  stops: { orderBy: { sequence: 'asc' as const } },
  trips: { include: { customer: true } },
};

@Injectable()
export class TripGroupsService {
  constructor(
    private prisma: PrismaService,
    private publisher: RealtimePublisher,
    private wallet: WalletService,
  ) {}

  async findAvailable() {
    return this.prisma.tripGroup.findMany({
      where: { status: 'MATCHING' },
      orderBy: { createdAt: 'asc' },
      include: fullInclude,
    });
  }

  async findMyGroups(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');

    return this.prisma.tripGroup.findMany({
      where: { driverId: driver.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'asc' },
      include: fullInclude,
    });
  }

  async accept(userId: string, groupId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { vehicles: { where: { isActive: true }, take: 1 } },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    if (driver.vehicles.length === 0) {
      throw new BadRequestException('Bạn cần đăng ký xe trước khi nhận chuyến');
    }
    const vehicle = driver.vehicles[0];

    const group = await this.prisma.tripGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm chuyến ghép');
    if (group.status !== 'MATCHING' || group.driverId) {
      throw new BadRequestException('Nhóm chuyến này đã được nhận hoặc không còn khả dụng');
    }
    if (vehicle.seats < group.seatsUsed) {
      throw new BadRequestException('Xe của bạn không đủ chỗ cho nhóm chuyến này');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tripGroup.updateMany({
        where: { id: groupId, status: 'MATCHING', driverId: null },
        data: { driverId: driver.id, vehicleId: vehicle.id, status: 'ASSIGNED' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Nhóm chuyến này vừa được tài xế khác nhận');
      }
      await tx.trip.updateMany({
        where: { groupId, status: 'ASSIGNED' },
        data: { driverId: driver.id, vehicleId: vehicle.id, status: 'ACCEPTED', acceptedAt: now },
      });
      await tx.driver.update({ where: { id: driver.id }, data: { status: 'ON_TRIP' } });
    });

    const result = await this.prisma.tripGroup.findUnique({ where: { id: groupId }, include: fullInclude });
    this.publishGroup(result!, userId);
    for (const t of result!.trips) {
      this.publisher.publish({
        type: 'trip.updated',
        tripId: t.id,
        customerId: t.customerId,
        driverUserId: userId,
        status: t.status,
        groupId,
      });
    }
    return result;
  }

  private publishGroup(
    group: { id: string; status: string; currentStopIndex: number; trips: { customerId: string }[] },
    driverUserId: string | null,
  ) {
    this.publisher.publish({
      type: 'group.updated',
      groupId: group.id,
      status: group.status,
      currentStopIndex: group.currentStopIndex,
      customerIds: [...new Set(group.trips.map((t) => t.customerId))],
      driverUserId,
    });
  }

  async advanceStop(userId: string, groupId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');

    const group = await this.prisma.tripGroup.findUnique({
      where: { id: groupId },
      include: stopsInclude,
    });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm chuyến ghép');
    if (group.driverId !== driver.id) {
      throw new ForbiddenException('Không có quyền cập nhật nhóm chuyến này');
    }
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(group.status)) {
      throw new BadRequestException('Nhóm chuyến này không ở trạng thái có thể cập nhật');
    }
    if (group.currentStopIndex >= group.stops.length) {
      throw new BadRequestException('Đã hoàn thành tất cả điểm dừng');
    }

    const stop = group.stops[group.currentStopIndex];
    const now = new Date();
    const nextIndex = group.currentStopIndex + 1;
    const groupCompleted = nextIndex >= group.stops.length;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.tripStop.update({ where: { id: stop.id }, data: { completedAt: now } }),
      this.prisma.tripGroup.update({
        where: { id: groupId },
        data: {
          currentStopIndex: nextIndex,
          status: groupCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        },
      }),
    ];

    if (stop.kind === 'PICKUP') {
      ops.push(
        this.prisma.trip.update({
          where: { id: stop.tripId },
          data: { status: 'IN_PROGRESS', startedAt: now },
        }),
      );
    } else {
      ops.push(
        this.prisma.trip.update({
          where: { id: stop.tripId },
          data: { status: 'COMPLETED', completedAt: now },
        }),
      );
    }

    if (groupCompleted) {
      ops.push(this.prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE' } }));
    }

    await this.prisma.$transaction(ops);
    if (stop.kind === 'DROPOFF') await this.wallet.settleTrip(stop.tripId);

    const result = await this.prisma.tripGroup.findUnique({ where: { id: groupId }, include: fullInclude });
    this.publishGroup(result!, userId);
    const affected = result!.trips.find((t) => t.id === stop.tripId);
    if (affected) {
      this.publisher.publish({
        type: 'trip.updated',
        tripId: affected.id,
        customerId: affected.customerId,
        driverUserId: userId,
        status: affected.status,
        groupId,
      });
    }
    return result;
  }
}
