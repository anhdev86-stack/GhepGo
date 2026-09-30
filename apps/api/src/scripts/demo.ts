/**
 * Local demo data, created through the real services (pricing, promos, trip lifecycle, complaints).
 *
 *   pnpm --filter api demo:seed      # once, on an empty local database
 *   pnpm --filter api demo:drivers   # keep the demo drivers "on duty" (GPS every 60 s) while you click around
 *
 * Refuses to run with NODE_ENV=production. All demo accounts use the password DEMO_PASSWORD.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TripsService } from '../trips/trips.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import { DriversService } from '../drivers/drivers.service.js';
import { FleetService } from '../fleet/fleet.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { ComplaintsService } from '../complaints/complaints.service.js';
import type { CreateTripDto } from '../trips/dto/create-trip.dto.js';

const DEMO_PASSWORD = 'demo1234';
const ADMIN = { phone: '0900000001', name: 'Trần Quản Trị' };
const CUSTOMERS = ['Nguyễn Minh Anh', 'Lê Thu Hà', 'Phạm Quốc Bảo', 'Võ Thanh Tâm', 'Đỗ Gia Hân', 'Bùi Khánh Linh', 'Hoàng Đức Minh', 'Ngô Phương Thảo', 'Đặng Tuấn Kiệt', 'Mai Hồng Nhung', 'Trịnh Văn Long', 'Lý Bảo Ngọc'];
const DRIVERS = [
  { name: 'Nguyễn Văn Tài', plate: '51A-234.56', make: 'Toyota', model: 'Vios', seats: 4 },
  { name: 'Trần Hữu Phước', plate: '51G-789.12', make: 'Kia', model: 'Morning', seats: 4 },
  { name: 'Lê Công Vinh', plate: '51H-456.78', make: 'Hyundai', model: 'Accent', seats: 4 },
  { name: 'Phan Minh Đức', plate: '51K-321.09', make: 'Mazda', model: 'CX-5', seats: 7 },
  { name: 'Huỳnh Tấn Phát', plate: '51F-654.32', make: 'VinFast', model: 'VF 5', seats: 4 },
];
const customerPhone = (i: number) => `09000000${String(2 + i).padStart(2, '0')}`; // 0900000002…
const driverPhone = (i: number) => `09000000${21 + i}`; // 0900000021…
const driverSpot = (i: number) => ({ lat: 10.7745 + i * 0.003, lng: 106.7005 - i * 0.0025 });

const P = {
  benThanh: { lat: 10.7725, lng: 106.698, a: 'Chợ Bến Thành, Quận 1' },
  nhaTho: { lat: 10.7798, lng: 106.699, a: 'Nhà thờ Đức Bà, Quận 1' },
  tanDinh: { lat: 10.7898, lng: 106.6907, a: 'Chợ Tân Định, Quận 1' },
  bitexco: { lat: 10.7716, lng: 106.7044, a: 'Bitexco Financial Tower' },
  landmark: { lat: 10.7951, lng: 106.7218, a: 'Landmark 81, Bình Thạnh' },
  tanSonNhat: { lat: 10.8188, lng: 106.6588, a: 'Sân bay Tân Sơn Nhất' },
  thaoDien: { lat: 10.803, lng: 106.737, a: 'Thảo Điền, TP Thủ Đức' },
  q7: { lat: 10.7295, lng: 106.7218, a: 'Crescent Mall, Quận 7' },
  cholon: { lat: 10.754, lng: 106.663, a: 'Chợ Lớn, Quận 5' },
  bachKhoa: { lat: 10.773, lng: 106.6597, a: 'ĐH Bách Khoa, Quận 10' },
};
type Place = (typeof P)[keyof typeof P];
const trip = (from: Place, to: Place, extra: Partial<CreateTripDto> = {}) =>
  ({ pickupAddress: from.a, pickupLat: from.lat, pickupLng: from.lng, dropoffAddress: to.a, dropoffLat: to.lat, dropoffLng: to.lng, tripType: 'PRIVATE', paymentMethod: 'CASH', ...extra }) as CreateTripDto;

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy dữ liệu demo trên production');
  const mode = process.argv[2] ?? 'seed';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    if (mode === 'drivers') await keepDriversOnline(app);
    else await seed(app);
  } finally {
    await app.close();
  }
}

async function seed(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>) {
  const prisma = app.get(PrismaService);
  const trips = app.get(TripsService);
  const vehicles = app.get(VehiclesService);
  const drivers = app.get(DriversService);
  const fleet = app.get(FleetService);
  const pricing = app.get(PricingService);
  const complaints = app.get(ComplaintsService);

  if (await prisma.user.findUnique({ where: { phone: ADMIN.phone } })) {
    console.log(`Đã có dữ liệu demo (tài khoản ${ADMIN.phone}). Xoá database local nếu muốn tạo lại.`);
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = (phone: string, fullName: string, role: 'ADMIN' | 'CUSTOMER' | 'DRIVER') =>
    prisma.user.create({
      data: { phone, passwordHash, fullName, role, wallet: { create: { balance: 0 } }, ...(role === 'DRIVER' ? { driver: { create: { licenseNumber: `DEMO-${phone}` } } } : {}) },
    });

  await mkUser(ADMIN.phone, ADMIN.name, 'ADMIN');
  const custIds: string[] = [];
  for (const [i, name] of CUSTOMERS.entries()) custIds.push((await mkUser(customerPhone(i), name, 'CUSTOMER')).id);
  const drvIds: string[] = [];
  for (const [i, d] of DRIVERS.entries()) {
    const u = await mkUser(driverPhone(i), d.name, 'DRIVER');
    await vehicles.create(u.id, { plateNumber: d.plate, make: d.make, model: d.model, seats: d.seats } as never);
    await drivers.updateStatus(u.id, { status: 'AVAILABLE' } as never);
    await drivers.updateLocation(u.id, driverSpot(i) as never);
    drvIds.push(u.id);
  }

  await fleet.createZone({ name: 'TP. Hồ Chí Minh', centerLat: 10.7769, centerLng: 106.7009, radiusKm: 15 } as never);
  const q1 = await fleet.createZone({ name: 'Quận 1 – Trung tâm', polygon: [[10.765, 106.688], [10.765, 106.71], [10.795, 106.71], [10.795, 106.688]] } as never);

  await pricing.createRule({ name: 'Bảng giá tiêu chuẩn', baseFare: 15000, perKm: 11000, perMinute: 300, minFare: 25000, roundTo: 1000, sharedDiscountPct: 25, nightSurchargePct: 20, nightStartHour: 22, nightEndHour: 5, surgeEnabled: true, surgeMax: 2, cancellationFee: 10000 } as never);
  await pricing.createRule({ zoneId: q1.id, name: 'Trung tâm Quận 1', baseFare: 18000, perKm: 12500, perMinute: 400, minFare: 30000, roundTo: 1000, sharedDiscountPct: 30, nightSurchargePct: 25, nightStartHour: 22, nightEndHour: 5, surgeEnabled: true, surgeMax: 2.5, cancellationFee: 15000 } as never);
  await pricing.createPromotion({ code: 'HELLO20', description: 'Giảm 20% cho khách mới', type: 'PERCENT', value: 20, maxDiscount: 20000, perUserLimit: 1, usageLimit: 1000, endsAt: '2026-12-31T16:59:00.000Z' } as never);
  await pricing.createPromotion({ code: 'GHEPXE15', description: 'Giảm 15.000đ cho chuyến xe ghép', type: 'FIXED', value: 15000, minFare: 40000, tripType: 'SHARED', perUserLimit: 3 } as never);
  await pricing.createPromotion({ code: 'SANBAY', description: 'Giảm 10% chuyến sân bay', type: 'PERCENT', value: 10, maxDiscount: 30000, perUserLimit: 5 } as never);

  // Completed trips through the real lifecycle (fare engine, promos, settlement).
  const routes: [Place, Place][] = [[P.benThanh, P.tanSonNhat], [P.nhaTho, P.landmark], [P.bitexco, P.thaoDien], [P.tanDinh, P.q7], [P.benThanh, P.cholon], [P.nhaTho, P.bachKhoa], [P.bitexco, P.tanSonNhat], [P.tanDinh, P.landmark]];
  const done: { id: string; customerId: string }[] = [];
  for (const [i, [from, to]] of routes.entries()) {
    const customerId = custIds[i % 6];
    const driverUserId = drvIds[i % drvIds.length];
    const promoCode = i === 1 ? 'HELLO20' : i === 3 ? 'SANBAY' : undefined;
    const t = await trips.create(customerId, trip(from, to, promoCode ? { promoCode } : {}));
    await trips.accept(driverUserId, t.id);
    for (const status of ['EN_ROUTE_TO_PICKUP', 'IN_PROGRESS', 'COMPLETED']) await trips.updateStatus(driverUserId, t.id, { status } as never);
    done.push({ id: t.id, customerId });
  }
  await complaints.create(done[0].customerId, { tripId: done[0].id, category: 'FARE', description: 'Tài xế đi đường vòng qua Cộng Hoà, giá cao hơn báo giá khoảng 20.000đ. Nhờ kiểm tra lại giúp em.' } as never);
  await complaints.create(done[2].customerId, { tripId: done[2].id, category: 'LOST_ITEM', description: 'Em để quên túi xách màu đen ở ghế sau, trong có ví và giấy tờ.' } as never);

  // A live trip for the first customer and the first driver.
  const live = await trips.create(custIds[0], trip(P.bitexco, P.landmark));
  await trips.accept(drvIds[0], live.id);
  await trips.updateStatus(drvIds[0], live.id, { status: 'EN_ROUTE_TO_PICKUP' } as never);

  // Open requests in the centre: demand above supply → surge on the booking page.
  const froms = [P.benThanh, P.nhaTho, P.tanDinh, P.bitexco];
  const tos = [P.tanSonNhat, P.q7, P.landmark, P.thaoDien];
  for (let i = 6; i < custIds.length; i++) await trips.create(custIds[i], trip(froms[i % 4], tos[i % 4]));

  // Four weeks of history with rush hours, copied from the completed trips, for forecast and reports.
  const history = await prisma.$executeRawUnsafe(`
    INSERT INTO trips (id, "customerId", "driverId", "vehicleId", "tripType", status, "pickupAddress", "pickupLat", "pickupLng", "dropoffAddress", "dropoffLat", "dropoffLng",
                       "distanceMeters", "durationSecs", fare, "requestedAt", "acceptedAt", "startedAt", "completedAt", "seatsRequested", "paymentMethod", "pickupZoneId", "surgeMultiplier", "discountAmount")
    SELECT gen_random_uuid()::text, t."customerId", t."driverId", t."vehicleId", t."tripType", 'COMPLETED', t."pickupAddress", t."pickupLat" + (random() - 0.5) * 0.012, t."pickupLng" + (random() - 0.5) * 0.012,
           t."dropoffAddress", t."dropoffLat", t."dropoffLng", t."distanceMeters", t."durationSecs", t.fare, ts, ts + interval '2 min', ts + interval '7 min',
           ts + interval '7 min' + make_interval(secs => t."durationSecs"), t."seatsRequested", t."paymentMethod", t."pickupZoneId", 1, 0
    FROM generate_series(now() - interval '28 days', now() - interval '90 minutes', interval '6 minutes') ts
    CROSS JOIN LATERAL (SELECT * FROM trips WHERE status = 'COMPLETED' AND "driverId" IS NOT NULL AND ts IS NOT NULL ORDER BY random() LIMIT 1) t
    WHERE random() < (CASE WHEN extract(hour FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (7, 8) THEN 0.9
                           WHEN extract(hour FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (17, 18, 19) THEN 1.0
                           WHEN extract(hour FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN 10 AND 16 THEN 0.38
                           WHEN extract(hour FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN 20 AND 22 THEN 0.55
                           WHEN extract(hour FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN 0 AND 5 THEN 0.05 ELSE 0.28 END)
                   * (CASE WHEN extract(dow FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (0, 6) THEN 0.75 ELSE 1 END)`);

  console.log(`Đã tạo dữ liệu demo: ${CUSTOMERS.length} khách, ${DRIVERS.length} tài xế, 2 khu vực, 2 bảng giá, 3 mã khuyến mãi, ${routes.length + 7} chuyến + ${history} chuyến lịch sử.`);
  console.log(`Mật khẩu mọi tài khoản: ${DEMO_PASSWORD}`);
  console.log(`  Admin     ${ADMIN.phone}`);
  console.log(`  Khách     ${customerPhone(0)} (có chuyến đang chạy), ${customerPhone(2)} (chưa dùng mã HELLO20)`);
  console.log(`  Tài xế    ${driverPhone(0)} (đang chạy chuyến)`);
  console.log('Tài xế chỉ hiện "đang trực" 2 phút sau lần gửi GPS cuối: chạy `pnpm --filter api demo:drivers` để giữ họ online.');
}

/** Sends a GPS fix for every demo driver each minute (small jitter) until Ctrl+C. */
async function keepDriversOnline(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>) {
  const prisma = app.get(PrismaService);
  const drivers = app.get(DriversService);
  const users = await prisma.user.findMany({ where: { phone: { in: DRIVERS.map((_, i) => driverPhone(i)) } }, orderBy: { phone: 'asc' } });
  if (!users.length) throw new Error('Chưa có tài xế demo, chạy `pnpm --filter api demo:seed` trước');
  let stop = false;
  process.once('SIGINT', () => (stop = true));
  console.log(`Giữ ${users.length} tài xế demo online, Ctrl+C để dừng.`);
  while (!stop) {
    for (const [i, u] of users.entries()) {
      const s = driverSpot(i);
      await drivers.updateLocation(u.id, { lat: s.lat + (Math.random() - 0.5) * 0.002, lng: s.lng + (Math.random() - 0.5) * 0.002 } as never).catch((e: Error) => console.warn(u.phone, e.message));
    }
    for (let s = 0; s < 60 && !stop; s++) await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
