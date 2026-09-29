import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { CreateTripDto } from '../trips/dto/create-trip.dto.js';
import { estimateDurationSecs, estimateFare, haversineDistanceMeters, PER_KM_VND } from '../common/geo.util.js';
import { orderStops, totalRouteDistanceMeters, type LatLng, type RouteStop } from '../common/route.util.js';
import {
  DETOUR_RATIO,
  DROPOFF_CLUSTER_METERS,
  MATCH_RETRIES,
  MAX_STOPS_PER_GROUP,
  MIN_DETOUR_CAP_METERS,
  PICKUP_CLUSTER_METERS,
  SHARED_DISCOUNT,
  SHARED_MAX_SEATS,
} from './matching.constants.js';

const NEW_TRIP_PLACEHOLDER_ID = '__new__';

type StopRow = {
  id: string;
  tripId: string;
  kind: 'PICKUP' | 'DROPOFF';
  sequence: number;
  address: string;
  lat: number;
  lng: number;
  completedAt: Date | null;
};

interface Candidate {
  groupId: string;
  status: string;
  driverId: string | null;
  vehicleId: string | null;
  seatsUsed: number;
  currentStopIndex: number;
  /** Re-ordered free stops (includes the new rider's two stops). */
  newFreeOrder: RouteStop[];
  newTotal: number;
  detourExtraMeters: number;
}

interface TripCtx {
  seatsRequested: number;
  directDistanceMeters: number;
  durationSecs: number;
  directFare: number;
}

class MatchConflict extends Error {}

/**
 * Heuristic carpool matcher.
 *
 *  - Rule-based bucketing: pickup/dropoff must be near a stop of the group
 *    that has not been visited yet.
 *  - Route cost: exact re-ordering of the remaining stops; the rider joins
 *    the group that grows the least, within a detour cap.
 *  - Dynamic re-matching: groups that already have a driver (ASSIGNED,
 *    IN_PROGRESS) are eligible too; completed stops are frozen and the
 *    driver's live position (Redis) is used as the route origin.
 *  - Fair pricing: each rider pays a discounted fare for their own direct
 *    distance plus the marginal detour they impose on the group.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private publisher: RealtimePublisher,
  ) {}

  async matchOrCreateGroup(customerId: string, dto: CreateTripDto) {
    const seatsRequested = dto.seatsRequested ?? 1;
    const directDistanceMeters = Math.round(
      haversineDistanceMeters(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng),
    );
    const ctx: TripCtx = {
      seatsRequested,
      directDistanceMeters,
      directFare: estimateFare(directDistanceMeters),
      durationSecs: estimateDurationSecs(directDistanceMeters),
    };

    for (let attempt = 0; attempt <= MATCH_RETRIES; attempt++) {
      const best = await this.findBestGroup(dto, ctx);
      try {
        if (best) return await this.joinGroup(customerId, dto, ctx, best);
        return await this.createNewGroup(customerId, dto, ctx);
      } catch (err) {
        if (err instanceof MatchConflict && attempt < MATCH_RETRIES) {
          this.logger.debug(`match conflict on group ${best?.groupId}, retrying`);
          continue;
        }
        throw err;
      }
    }
    // unreachable, satisfies the type checker
    return this.createNewGroup(customerId, dto, ctx);
  }

  // ------------------------------------------------------------------
  // Candidate search
  // ------------------------------------------------------------------

  private async findBestGroup(dto: CreateTripDto, ctx: TripCtx): Promise<Candidate | null> {
    const newPickup: RouteStop = {
      tripId: NEW_TRIP_PLACEHOLDER_ID,
      kind: 'PICKUP',
      lat: dto.pickupLat,
      lng: dto.pickupLng,
      address: dto.pickupAddress,
    };
    const newDropoff: RouteStop = {
      tripId: NEW_TRIP_PLACEHOLDER_ID,
      kind: 'DROPOFF',
      lat: dto.dropoffLat,
      lng: dto.dropoffLng,
      address: dto.dropoffAddress,
    };

    const candidates = await this.prisma.tripGroup.findMany({
      where: {
        status: { in: ['MATCHING', 'ASSIGNED', 'IN_PROGRESS'] },
        seatsUsed: { lte: SHARED_MAX_SEATS - ctx.seatsRequested },
      },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        vehicle: { select: { seats: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const cap = Math.max(MIN_DETOUR_CAP_METERS, ctx.directDistanceMeters * DETOUR_RATIO);
    let best: Candidate | null = null;

    for (const g of candidates) {
      const seatCapacity = Math.min(g.seatsTotal, g.vehicle?.seats ?? g.seatsTotal);
      if (g.seatsUsed + ctx.seatsRequested > seatCapacity) continue;

      const stops = g.stops as StopRow[];
      const fixed = stops.filter((s) => s.sequence < g.currentStopIndex);
      const free = stops.filter((s) => s.sequence >= g.currentStopIndex);
      if (free.length === 0) continue;
      if (free.length + 2 > MAX_STOPS_PER_GROUP) continue;

      // Bucketing: new rider must be close to the part of the route still ahead.
      const nearestPickup = Math.min(
        ...free.map((s) => haversineDistanceMeters(s.lat, s.lng, dto.pickupLat, dto.pickupLng)),
      );
      const nearestDropoff = Math.min(
        ...free
          .filter((s) => s.kind === 'DROPOFF')
          .map((s) => haversineDistanceMeters(s.lat, s.lng, dto.dropoffLat, dto.dropoffLng)),
      );
      if (nearestPickup > PICKUP_CLUSTER_METERS || nearestDropoff > DROPOFF_CLUSTER_METERS) continue;

      const origin = await this.resolveOrigin(g.driverId, fixed);
      const alreadyPickedUp = new Set(fixed.filter((s) => s.kind === 'PICKUP').map((s) => s.tripId));

      const freeRoute: RouteStop[] = free.map((s) => ({
        tripId: s.tripId,
        kind: s.kind,
        lat: s.lat,
        lng: s.lng,
        address: s.address,
      }));
      const oldTotal = totalRouteDistanceMeters(freeRoute, origin);
      const newFreeOrder = orderStops([...freeRoute, newPickup, newDropoff], origin, alreadyPickedUp);
      const newTotal = totalRouteDistanceMeters(newFreeOrder, origin);
      const detourExtraMeters = Math.max(0, newTotal - oldTotal);

      if (detourExtraMeters > cap) continue;
      if (!best || detourExtraMeters < best.detourExtraMeters) {
        best = {
          groupId: g.id,
          status: g.status,
          driverId: g.driverId,
          vehicleId: g.vehicleId,
          seatsUsed: g.seatsUsed,
          currentStopIndex: g.currentStopIndex,
          newFreeOrder,
          newTotal: totalRouteDistanceMeters(fixed) + newTotal,
          detourExtraMeters,
        };
      }
    }

    return best;
  }

  /** Vehicle's current position: live GPS → last completed stop → undefined (route not started). */
  private async resolveOrigin(driverId: string | null, fixed: StopRow[]): Promise<LatLng | undefined> {
    if (driverId) {
      const live = await this.redis.getDriverLocation(driverId);
      if (live) return { lat: live.lat, lng: live.lng };
    }
    const last = fixed.at(-1);
    return last ? { lat: last.lat, lng: last.lng } : undefined;
  }

  // ------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------

  private sharedFare(ctx: TripCtx, detourExtraMeters: number) {
    const base = Math.round(ctx.directFare * SHARED_DISCOUNT);
    const detour = Math.round((detourExtraMeters / 1000) * PER_KM_VND);
    return base + detour;
  }

  private async joinGroup(customerId: string, dto: CreateTripDto, ctx: TripCtx, best: Candidate) {
    const fare = this.sharedFare(ctx, best.detourExtraMeters);
    const hasDriver = !!best.driverId;

    const trip = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the group must be exactly as we evaluated it.
      const locked = await tx.tripGroup.updateMany({
        where: {
          id: best.groupId,
          seatsUsed: best.seatsUsed,
          currentStopIndex: best.currentStopIndex,
          status: best.status as never,
        },
        data: { seatsUsed: { increment: ctx.seatsRequested }, totalDistanceMeters: best.newTotal },
      });
      if (locked.count !== 1) throw new MatchConflict();

      const created = await tx.trip.create({
        data: {
          customerId,
          tripType: 'SHARED',
          paymentMethod: dto.paymentMethod ?? 'CASH',
          status: hasDriver ? 'ACCEPTED' : 'ASSIGNED',
          groupId: best.groupId,
          driverId: best.driverId,
          vehicleId: best.vehicleId,
          acceptedAt: hasDriver ? new Date() : null,
          seatsRequested: ctx.seatsRequested,
          pickupAddress: dto.pickupAddress,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
          dropoffAddress: dto.dropoffAddress,
          dropoffLat: dto.dropoffLat,
          dropoffLng: dto.dropoffLng,
          distanceMeters: ctx.directDistanceMeters,
          durationSecs: ctx.durationSecs,
          fare,
        },
      });

      // Replace only the stops still ahead of the vehicle.
      await tx.tripStop.deleteMany({
        where: { groupId: best.groupId, sequence: { gte: best.currentStopIndex } },
      });
      await tx.tripStop.createMany({
        data: best.newFreeOrder.map((stop, i) => ({
          groupId: best.groupId,
          tripId: stop.tripId === NEW_TRIP_PLACEHOLDER_ID ? created.id : stop.tripId,
          kind: stop.kind,
          sequence: best.currentStopIndex + i,
          address: stop.address,
          lat: stop.lat,
          lng: stop.lng,
        })),
      });

      return created;
    });

    await this.notifyGroupChanged(best.groupId);
    if (hasDriver) {
      const driver = await this.prisma.driver.findUnique({ where: { id: best.driverId! }, select: { userId: true } });
      this.publisher.publish({
        type: 'trip.updated',
        tripId: trip.id,
        customerId,
        driverUserId: driver?.userId ?? null,
        status: 'ACCEPTED',
        groupId: best.groupId,
        reason: 'rider_joined',
      });
    }
    return trip;
  }

  private async createNewGroup(customerId: string, dto: CreateTripDto, ctx: TripCtx) {
    const fare = this.sharedFare(ctx, 0);

    const trip = await this.prisma.$transaction(async (tx) => {
      const group = await tx.tripGroup.create({
        data: {
          status: 'MATCHING',
          seatsTotal: SHARED_MAX_SEATS,
          seatsUsed: ctx.seatsRequested,
          totalDistanceMeters: ctx.directDistanceMeters,
        },
      });

      const created = await tx.trip.create({
        data: {
          customerId,
          tripType: 'SHARED',
          paymentMethod: dto.paymentMethod ?? 'CASH',
          status: 'ASSIGNED',
          groupId: group.id,
          seatsRequested: ctx.seatsRequested,
          pickupAddress: dto.pickupAddress,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
          dropoffAddress: dto.dropoffAddress,
          dropoffLat: dto.dropoffLat,
          dropoffLng: dto.dropoffLng,
          distanceMeters: ctx.directDistanceMeters,
          durationSecs: ctx.durationSecs,
          fare,
        },
      });

      await tx.tripStop.createMany({
        data: [
          { groupId: group.id, tripId: created.id, kind: 'PICKUP', sequence: 0, address: dto.pickupAddress, lat: dto.pickupLat, lng: dto.pickupLng },
          { groupId: group.id, tripId: created.id, kind: 'DROPOFF', sequence: 1, address: dto.dropoffAddress, lat: dto.dropoffLat, lng: dto.dropoffLng },
        ],
      });

      return created;
    });

    this.publisher.publish({ type: 'group.created', groupId: trip.groupId! });
    return trip;
  }

  /**
   * Rider leaves a group before being picked up (cancellation). Their stops
   * are removed, seats released, remaining free stops re-optimised. An empty
   * group is cancelled.
   */
  async removeTripFromGroup(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { group: { include: { stops: { orderBy: { sequence: 'asc' } } } } },
    });
    if (!trip?.group) return;
    const group = trip.group;
    const stops = group.stops as StopRow[];

    const fixed = stops.filter((s) => s.sequence < group.currentStopIndex);
    const free = stops.filter((s) => s.sequence >= group.currentStopIndex && s.tripId !== tripId);
    const origin = await this.resolveOrigin(group.driverId, fixed);
    const alreadyPickedUp = new Set(fixed.filter((s) => s.kind === 'PICKUP').map((s) => s.tripId));
    const reordered = orderStops(
      free.map((s) => ({ tripId: s.tripId, kind: s.kind, lat: s.lat, lng: s.lng, address: s.address })),
      origin,
      alreadyPickedUp,
    );
    const remainingTrips = await this.prisma.trip.count({
      where: { groupId: group.id, id: { not: tripId }, status: { notIn: ['CANCELLED'] } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.tripStop.deleteMany({ where: { groupId: group.id, sequence: { gte: group.currentStopIndex } } });
      if (reordered.length > 0) {
        await tx.tripStop.createMany({
          data: reordered.map((s, i) => ({
            groupId: group.id,
            tripId: s.tripId,
            kind: s.kind,
            sequence: group.currentStopIndex + i,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
          })),
        });
      }
      await tx.tripGroup.update({
        where: { id: group.id },
        data: {
          seatsUsed: { decrement: trip.seatsRequested },
          totalDistanceMeters: totalRouteDistanceMeters(fixed) + totalRouteDistanceMeters(reordered, origin),
          ...(remainingTrips === 0 ? { status: 'CANCELLED' } : {}),
        },
      });
    });

    await this.notifyGroupChanged(group.id);
  }

  async notifyGroupChanged(groupId: string) {
    const group = await this.prisma.tripGroup.findUnique({
      where: { id: groupId },
      select: {
        status: true,
        currentStopIndex: true,
        driver: { select: { userId: true } },
        trips: { select: { customerId: true } },
      },
    });
    if (!group) return;
    this.publisher.publish({
      type: 'group.updated',
      groupId,
      status: group.status,
      currentStopIndex: group.currentStopIndex,
      customerIds: [...new Set(group.trips.map((t) => t.customerId))],
      driverUserId: group.driver?.userId ?? null,
    });
  }
}
