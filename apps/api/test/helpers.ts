import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StripSensitiveInterceptor } from '../src/common/strip-sensitive.interceptor.js';
import { ZonesService } from '../src/zones/zones.service.js';

/**
 * A fresh Vietnamese mobile number for this test process. Purely random (not derived from the clock) and never
 * handed out twice, so two sign-ups in one run cannot share a number and trip the 60 s OTP resend lock.
 */
const issuedPhones = new Set<string>();
export function uniquePhone(): string {
  for (;;) {
    const phone = `09${Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')}`;
    if (!issuedPhones.has(phone)) {
      issuedPhones.add(phone);
      return phone;
    }
  }
}

export interface Session {
  token: string;
  refreshToken: string;
  user: { id: string; phone: string; role: string; fullName: string };
}

export class TestApp {
  app!: INestApplication;
  prisma!: PrismaService;
  baseUrl!: string;
  private sockets: Socket[] = [];

  async start() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = moduleRef.createNestApplication();
    this.app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    this.app.useGlobalInterceptors(new StripSensitiveInterceptor());
    this.app.setGlobalPrefix('api');
    await this.app.init();
    await this.app.listen(0);
    const { port } = this.app.getHttpServer().address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.prisma = this.app.get(PrismaService);
    return this;
  }

  async stop() {
    this.sockets.forEach((s) => s.close());
    await this.app.close();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  /** Fires a request and returns the parsed body; throws with status+message on non-2xx. */
  async call<T = any>(method: 'get' | 'post' | 'patch' | 'delete', path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
    let r = this.http()[method](`/api${path}`);
    if (opts.token) r = r.set('Authorization', `Bearer ${opts.token}`);
    if (opts.body !== undefined) r = r.send(opts.body as object);
    const res = await r;
    if (res.status >= 400) {
      const err = new Error(`${method.toUpperCase()} ${path} → ${res.status}: ${res.body?.message ?? res.text}`) as Error & { status: number; body: any };
      err.status = res.status;
      err.body = res.body;
      throw err;
    }
    return res.body as T;
  }

  /** Full OTP registration flow. */
  async register(role: 'CUSTOMER' | 'DRIVER', fullName: string = role): Promise<Session> {
    // Also skip numbers an earlier spec file already registered (users are stored in local 0xxxxxxxxx form).
    let phone = uniquePhone();
    while (await this.prisma.user.findUnique({ where: { phone } })) phone = uniquePhone();
    const sent = await this.call('post', '/auth/otp/send', { body: { phone, purpose: 'REGISTER' } });
    const ver = await this.call('post', '/auth/otp/verify', { body: { phone, purpose: 'REGISTER', code: sent.devCode } });
    const auth = await this.call('post', '/auth/register', {
      body: { phone, password: 'secret123', fullName, role, verificationToken: ver.verificationToken },
    });
    return { token: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user };
  }

  /** Registers a customer then promotes it to ADMIN directly in the DB. */
  async admin(): Promise<Session> {
    const s = await this.register('CUSTOMER', 'Admin e2e');
    await this.prisma.user.update({ where: { id: s.user.id }, data: { role: 'ADMIN' } });
    const auth = await this.call('post', '/auth/login', { body: { phone: s.user.phone, password: 'secret123' } });
    return { token: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user };
  }

  /** Driver with an active vehicle, on duty, with a live GPS fix. */
  async driverOnDuty(fullName = 'Driver', at = { lat: 10.773, lng: 106.699 }, seats = 4): Promise<Session> {
    const d = await this.register('DRIVER', fullName);
    await this.call('post', '/vehicles', { token: d.token, body: { plateNumber: `E2E-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`, make: 'Test', model: 'Car', seats } });
    await this.call('patch', '/drivers/me/status', { token: d.token, body: { status: 'AVAILABLE' } });
    await this.call('patch', '/drivers/me/location', { token: d.token, body: at });
    return d;
  }

  async socket(token: string): Promise<Socket> {
    const s = await new Promise<Socket>((resolve, reject) => {
      const sock = io(`${this.baseUrl}/realtime`, { auth: { token }, transports: ['websocket'] });
      sock.on('connect', () => resolve(sock));
      sock.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    });
    this.sockets.push(s);
    return s;
  }

  /** Deactivates every service zone so tests start without area restrictions. */
  async clearZones() {
    await this.prisma.serviceZone.updateMany({ data: { isActive: false } });
    this.app.get(ZonesService).invalidate();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function expectStatus(p: Promise<unknown>, status: number, messageIncludes?: string) {
  try {
    await p;
  } catch (err) {
    const e = err as { status?: number; message?: string };
    expect(e.status).toBe(status);
    if (messageIncludes) expect(e.message).toContain(messageIncludes);
    return;
  }
  throw new Error(`expected HTTP ${status}, request succeeded`);
}

export const HCM = {
  benThanh: { lat: 10.7725, lng: 106.698 },
  nhaTho: { lat: 10.7798, lng: 106.699 },
  tanDinh: { lat: 10.7898, lng: 106.6907 },
  langChaCa: { lat: 10.8009, lng: 106.6665 },
  hoangVanThu: { lat: 10.8065, lng: 106.6644 },
  tanSonNhat: { lat: 10.8188, lng: 106.6588 },
};

export const tripBody = (pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }, extra: Record<string, unknown> = {}) => ({
  pickupAddress: 'P', pickupLat: pickup.lat, pickupLng: pickup.lng,
  dropoffAddress: 'D', dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
  tripType: 'PRIVATE', ...extra,
});
