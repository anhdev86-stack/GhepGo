import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTripDto } from '../trips/dto/create-trip.dto.js';
import { estimateDurationSecs, estimateFare, haversineDistanceMeters, PER_KM_VND } from '../common/geo.util.js';
import { orderStops, totalRouteDistanceMeters, type RouteStop } from '../common/route.util.js';
import {
  DETOUR_RATIO,
  DROPOFF_CLUSTER_METERS,
  MIN_DETOUR_CAP_METERS,
  PICKUP_CLUSTER_METERS,
  SHARED_DISCOUNT,
  SHARED_MAX_SEATS,
} from './matching.constants.js';

const NEW_TRIP_PLACEHOLDER_ID = '__new__';

@Injectable()
export class MatchingService {
  constructor(private prisma: PrismaService) {}

  async matchOrCreateGroup(customerId: string, dto: CreateTripDto) {
    const seatsRequested = dto.seatsRequested ?? 1;
    const directDistanceMeters = Math.round(
      haversineDistanceMeters(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng),
    );
    const directFare = estimateFare(directDistanceMeters);
    const durationSecs = estimateDurationSecs(directDistanceMeters);

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
        status: 'MATCHING',
        seatsUsed: { lte: SHARED_MAX_SEATS - seatsRequested },
      },
      include: { stops: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    let best: {
      groupId: string;
      newOrder: RouteStop[];
      newTotal: number;
      detourExtraMeters: number;
    } | null = null;

    const cap = Math.max(MIN_DETOUR_CAP_METERS, directDistanceMeters * DETOUR_RATIO);

    for (const candidate of candidates) {
      if (candidate.seatsUsed + seatsRequested > candidate.seatsTotal) continue;
      if (candidate.stops.length === 0) continue;

      const nearestPickup = Math.min(
        ...candidate.stops
          .filter((s) => s.kind === 'PICKUP')
          .map((s) => haversineDistanceMeters(s.lat, s.lng, dto.pickupLat, dto.pickupLng)),
      );
      const nearestDropoff = Math.min(
        ...candidate.stops
          .filter((s) => s.kind === 'DROPOFF')
          .map((s) => haversineDistanceMeters(s.lat, s.lng, dto.dropoffLat, dto.dropoffLng)),
      );
      if (nearestPickup > PICKUP_CLUSTER_METERS || nearestDropoff > DROPOFF_CLUSTER_METERS) continue;

      const combined: RouteStop[] = [
        ...candidate.stops.map((s) => ({
          tripId: s.tripId,
          kind: s.kind,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
        })),
        newPickup,
        newDropoff,
      ];
      const newOrder = orderStops(combined);
      const newTotal = totalRouteDistanceMeters(newOrder);
      const oldTotal = candidate.totalDistanceMeters ?? totalRouteDistanceMeters(candidate.stops);
      const detourExtraMeters = Math.max(0, newTotal - oldTotal);

      if (detourExtraMeters > cap) continue;
      if (!best || detourExtraMeters < best.detourExtraMeters) {
        best = { groupId: candidate.id, newOrder, newTotal, detourExtraMeters };
      }
    }

    if (best) {
      return this.joinGroup(customerId, dto, {
        seatsRequested,
        directDistanceMeters,
        durationSecs,
        directFare,
        ...best,
      });
    }

    return this.createNewGroup(customerId, dto, {
      seatsRequested,
      directDistanceMeters,
      durationSecs,
      directFare,
    });
  }

  private async joinGroup(
    customerId: string,
    dto: CreateTripDto,
    ctx: {
      groupId: string;
      newOrder: RouteStop[];
      newTotal: number;
      detourExtraMeters: number;
      seatsRequested: number;
      directDistanceMeters: number;
      durationSecs: number;
      directFare: number;
    },
  ) {
    const sharedBaseFare = Math.round(ctx.directFare * SHARED_DISCOUNT);
    const detourExtraFare = Math.round((ctx.detourExtraMeters / 1000) * PER_KM_VND);
    const fare = sharedBaseFare + detourExtraFare;

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          customerId,
          tripType: 'SHARED',
          status: 'ASSIGNED',
          groupId: ctx.groupId,
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

      await tx.tripStop.deleteMany({ where: { groupId: ctx.groupId } });
      await tx.tripStop.createMany({
        data: ctx.newOrder.map((stop, index) => ({
          groupId: ctx.groupId,
          tripId: stop.tripId === NEW_TRIP_PLACEHOLDER_ID ? trip.id : stop.tripId,
          kind: stop.kind,
          sequence: index,
          address: stop.address,
          lat: stop.lat,
          lng: stop.lng,
        })),
      });

      await tx.tripGroup.update({
        where: { id: ctx.groupId },
        data: {
          seatsUsed: { increment: ctx.seatsRequested },
          totalDistanceMeters: ctx.newTotal,
        },
      });

      return trip;
    });
  }

  private async createNewGroup(
    customerId: string,
    dto: CreateTripDto,
    ctx: {
      seatsRequested: number;
      directDistanceMeters: number;
      durationSecs: number;
      directFare: number;
    },
  ) {
    const fare = Math.round(ctx.directFare * SHARED_DISCOUNT);

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.tripGroup.create({
        data: {
          status: 'MATCHING',
          seatsTotal: SHARED_MAX_SEATS,
          seatsUsed: ctx.seatsRequested,
          totalDistanceMeters: ctx.directDistanceMeters,
        },
      });

      const trip = await tx.trip.create({
        data: {
          customerId,
          tripType: 'SHARED',
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
          {
            groupId: group.id,
            tripId: trip.id,
            kind: 'PICKUP',
            sequence: 0,
            address: dto.pickupAddress,
            lat: dto.pickupLat,
            lng: dto.pickupLng,
          },
          {
            groupId: group.id,
            tripId: trip.id,
            kind: 'DROPOFF',
            sequence: 1,
            address: dto.dropoffAddress,
            lat: dto.dropoffLat,
            lng: dto.dropoffLng,
          },
        ],
      });

      return trip;
    });
  }
}
