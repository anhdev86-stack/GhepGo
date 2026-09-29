import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Small JSON the client uses to deep-link (tripId, groupId, screen...). */
  data?: Record<string, unknown>;
  /** Skip persisting to the in-app inbox (e.g. chatty driver broadcasts). */
  transient?: boolean;
}

/**
 * Delivers a notification to every registered device of a user:
 *  - Expo push (mobile app)          — expo-server-sdk, chunked, invalid tokens pruned
 *  - Web Push (browser, VAPID)       — web-push, 404/410 subscriptions pruned
 *  - in-app inbox (Notification row) + realtime event so open clients update instantly
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo: Expo;
  readonly vapidPublicKey: string | null;

  constructor(
    private prisma: PrismaService,
    private publisher: RealtimePublisher,
    config: ConfigService,
  ) {
    this.expo = new Expo({ accessToken: config.get<string>('EXPO_ACCESS_TOKEN') || undefined });
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    if (pub && priv) {
      webpush.setVapidDetails(config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@ghepgo.local', pub, priv);
      this.vapidPublicKey = pub;
    } else {
      this.vapidPublicKey = null;
      this.logger.warn('VAPID keys missing — web push disabled (run: npx web-push generate-vapid-keys)');
    }
  }

  // ---------------- devices ----------------

  async registerDevice(
    userId: string,
    input: { kind: 'EXPO' | 'WEBPUSH'; token: string; subscription?: unknown; platform?: string },
  ) {
    if (input.kind === 'EXPO' && !Expo.isExpoPushToken(input.token)) {
      throw new Error('Expo push token không hợp lệ');
    }
    return this.prisma.pushDevice.upsert({
      where: { token: input.token },
      create: {
        userId,
        kind: input.kind,
        token: input.token,
        subscription: input.subscription as never,
        platform: input.platform,
      },
      // A token re-registered by another account moves to that account.
      update: { userId, subscription: input.subscription as never, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  // ---------------- inbox ----------------

  async list(userId: string, unreadOnly = false, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ---------------- sending ----------------

  async sendToUsers(userIds: string[], payload: PushPayload) {
    await Promise.allSettled([...new Set(userIds)].map((id) => this.sendToUser(id, payload)));
  }

  async sendToUser(userId: string, payload: PushPayload) {
    let notificationId: string | undefined;
    if (!payload.transient) {
      const n = await this.prisma.notification.create({
        data: { userId, title: payload.title, body: payload.body, data: (payload.data ?? {}) as never },
      });
      notificationId = n.id;
      this.publisher.publish({ type: 'notification', userId, notification: { id: n.id, title: n.title, body: n.body, data: payload.data ?? {}, createdAt: n.createdAt.toISOString() } });
    }

    const devices = await this.prisma.pushDevice.findMany({ where: { userId } });
    if (devices.length === 0) return;
    const data = { ...(payload.data ?? {}), notificationId };
    await Promise.allSettled([
      this.sendExpo(devices.filter((d) => d.kind === 'EXPO').map((d) => d.token), payload, data),
      this.sendWebPush(devices.filter((d) => d.kind === 'WEBPUSH'), payload, data),
    ]);
  }

  private async sendExpo(tokens: string[], payload: PushPayload, data: Record<string, unknown>) {
    if (tokens.length === 0) return;
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));
    const invalid: string[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((t, i) => {
          if (t.status === 'error') {
            this.logger.warn(`Expo push error: ${t.message} (${t.details?.error})`);
            if (t.details?.error === 'DeviceNotRegistered') invalid.push(chunk[i].to as string);
          }
        });
      } catch (err) {
        this.logger.warn(`Expo push failed: ${(err as Error).message}`);
      }
    }
    if (invalid.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: invalid } } });
  }

  private async sendWebPush(
    devices: { token: string; subscription: unknown }[],
    payload: PushPayload,
    data: Record<string, unknown>,
  ) {
    if (!this.vapidPublicKey || devices.length === 0) return;
    const body = JSON.stringify({ title: payload.title, body: payload.body, data });
    const gone: string[] = [];
    await Promise.all(
      devices.map(async (d) => {
        try {
          await webpush.sendNotification(d.subscription as webpush.PushSubscription, body, { TTL: 300 });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(d.token);
          else this.logger.warn(`Web push failed (${status}): ${(err as Error).message}`);
        }
      }),
    );
    if (gone.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
  }
}
