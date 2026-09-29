import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DriversService } from '../drivers/drivers.service.js';
import { REDIS_CHANNEL, rooms, WS, type RealtimeEvent } from './realtime.events.js';

interface SocketUser {
  userId: string;
  role: string;
  driverId?: string;
}

@WebSocketGateway({ cors: { origin: true, credentials: true }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private redis: RedisService,
    private driversService: DriversService,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(REDIS_CHANNEL, (event: RealtimeEvent) => this.fanOut(event));
  }

  // -------- connection lifecycle --------

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.toString().replace(/^Bearer /, '') || undefined);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string; role: string }>(token);
      const user: SocketUser = { userId: payload.sub, role: payload.role };
      if (user.role === 'DRIVER') {
        const driver = await this.prisma.driver.findUnique({ where: { userId: user.userId } });
        if (driver) user.driverId = driver.id;
      }
      client.data.user = user;
      await client.join(rooms.user(user.userId));
      if (user.role === 'DRIVER') await client.join(rooms.driversAvailable);
      if (user.role === 'ADMIN') await client.join(rooms.admins);
      this.logger.debug(`socket ${client.id} connected as ${user.role} ${user.userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`socket ${client.id} disconnected`);
  }

  // -------- client → server messages --------

  /** Driver streams GPS. Stored in Redis and fanned out to riders of active trips/groups. */
  @SubscribeMessage(WS.LOCATION_UPDATE)
  async onLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lat: number; lng: number; heading?: number; speed?: number },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || user.role !== 'DRIVER') return { ok: false };
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') return { ok: false };
    if (Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) return { ok: false };
    await this.driversService.recordLocation(user.userId, body);
    return { ok: true };
  }

  /** Rider/driver/admin subscribes to a trip room; ownership is checked. */
  @SubscribeMessage(WS.SUBSCRIBE_TRIP)
  async onSubscribeTrip(@ConnectedSocket() client: Socket, @MessageBody() body: { tripId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.tripId) return { ok: false };
    const trip = await this.prisma.trip.findUnique({
      where: { id: body.tripId },
      select: { customerId: true, driver: { select: { userId: true } }, groupId: true },
    });
    if (!trip) return { ok: false };
    const allowed =
      user.role === 'ADMIN' || trip.customerId === user.userId || trip.driver?.userId === user.userId;
    if (!allowed) return { ok: false };
    await client.join(rooms.trip(body.tripId));
    if (trip.groupId) await client.join(rooms.group(trip.groupId));
    return { ok: true };
  }

  @SubscribeMessage(WS.SUBSCRIBE_GROUP)
  async onSubscribeGroup(@ConnectedSocket() client: Socket, @MessageBody() body: { groupId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.groupId) return { ok: false };
    const group = await this.prisma.tripGroup.findUnique({
      where: { id: body.groupId },
      select: { driver: { select: { userId: true } }, trips: { select: { customerId: true } } },
    });
    if (!group) return { ok: false };
    const allowed =
      user.role === 'ADMIN' ||
      group.driver?.userId === user.userId ||
      group.trips.some((t) => t.customerId === user.userId);
    if (!allowed) return { ok: false };
    await client.join(rooms.group(body.groupId));
    return { ok: true };
  }

  // -------- Redis → sockets fan-out --------

  private fanOut(event: RealtimeEvent) {
    if (!this.server) return;
    switch (event.type) {
      case 'driver.location': {
        const payload = {
          driverId: event.driverId,
          lat: event.lat,
          lng: event.lng,
          heading: event.heading,
          speed: event.speed,
          updatedAt: event.updatedAt,
        };
        const targets = [
          ...event.tripIds.map(rooms.trip),
          ...event.groupIds.map(rooms.group),
          rooms.admins,
        ];
        this.server.to(targets).emit(WS.DRIVER_LOCATION, payload);
        break;
      }
      case 'trip.created':
        this.server.to([rooms.driversAvailable, rooms.admins]).emit(WS.TRIP_NEW, event.trip);
        break;
      case 'trip.updated': {
        const targets = [rooms.trip(event.tripId), rooms.user(event.customerId), rooms.admins];
        if (event.driverUserId) targets.push(rooms.user(event.driverUserId));
        this.server.to(targets).emit(WS.TRIP_UPDATED, {
          tripId: event.tripId,
          status: event.status,
          groupId: event.groupId ?? null,
        });
        break;
      }
      case 'group.created':
        this.server.to([rooms.driversAvailable, rooms.admins]).emit(WS.GROUP_NEW, { groupId: event.groupId });
        break;
      case 'notification':
        this.server.to(rooms.user(event.userId)).emit(WS.NOTIFICATION, event.notification);
        break;
      case 'group.updated': {
        const targets = [rooms.group(event.groupId), rooms.admins, ...event.customerIds.map(rooms.user)];
        if (event.driverUserId) targets.push(rooms.user(event.driverUserId));
        this.server.to(targets).emit(WS.GROUP_UPDATED, {
          groupId: event.groupId,
          status: event.status,
          currentStopIndex: event.currentStopIndex,
        });
        break;
      }
    }
  }
}
