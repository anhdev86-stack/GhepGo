# GhepGo

Nền tảng đặt xe & ghép xe (ride-hailing / carpool platform). Giai đoạn 1 (MVP nền tảng):
đăng ký/đăng nhập, đặt chuyến (bao xe/xe ghép — chưa ghép AI), tài xế nhận & xử lý chuyến,
quản lý đội xe cơ bản, thanh toán tiền mặt. Ghép khách bằng AI, tối ưu tuyến, và thanh toán
online sẽ ở các giai đoạn sau.

## Kiến trúc monorepo

```
apps/
  api/      NestJS 12 + Prisma 6 + PostgreSQL/PostGIS — REST API (port 3001, prefix /api)
  web/      Next.js 16 (App Router) — web app cho khách hàng & admin (port 3000)
  mobile/   Expo SDK 57 + Expo Router — app di động cho tài xế
packages/
  shared/   Types dùng chung (TripStatus, TripType, DTO...) giữa các app
```

- Quản lý gói bằng **pnpm workspaces** (`pnpm-workspace.yaml`).
- API dùng ESM (`"type": "module"`) + NodeNext — mọi import tương đối trong `apps/api/src`
  phải có đuôi `.js`.
- Prisma được ghim ở bản **6.19.3** (bản 7/8 có breaking changes chưa phù hợp cho MVP).

## Yêu cầu môi trường

- Node.js >= 20
- pnpm (`corepack enable` hoặc cài global)
- Docker Desktop (chạy PostgreSQL + Redis local)

## Cài đặt

```bash
pnpm install
```

## 1. Hạ tầng (PostgreSQL + Redis)

```bash
docker compose up -d
```

- PostgreSQL (PostGIS): `localhost:5434` (user/pass/db: `ghepgo`)
- Redis: `localhost:6379`

> Cổng 5434 được dùng thay vì 5432 mặc định để tránh xung đột với các project Postgres khác
> đang chạy trên máy.

## 2. Backend API (`apps/api`)

```bash
cd apps/api
cp .env.example .env   # chỉnh JWT_SECRET nếu cần
pnpm prisma migrate dev
pnpm start:dev
```

API chạy tại `http://localhost:3001/api`.

### Các module chính

- **Auth**: `POST /auth/register`, `POST /auth/login` — JWT, role `CUSTOMER` / `DRIVER` / `ADMIN`.
- **Vehicles**: `POST /vehicles`, `GET /vehicles/mine`, `GET /vehicles` (admin).
- **Drivers**: `PATCH /drivers/me/status` (AVAILABLE/OFFLINE), `GET /drivers` (admin).
- **Trips**: `POST /trips` (đặt xe, tự tính khoảng cách/giá bằng công thức Haversine),
  `GET /trips/mine`, `GET /trips/available`, `GET /trips/driver/mine`,
  `POST /trips/:id/accept`, `PATCH /trips/:id/status`, `GET /trips/all` (admin).

Trạng thái chuyến đi: `REQUESTED → ACCEPTED → EN_ROUTE_TO_PICKUP → IN_PROGRESS → COMPLETED`
(hoặc `CANCELLED`), được validate ở server.

Toàn bộ response tự động loại bỏ field `passwordHash` qua `StripSensitiveInterceptor`.

## 3. Web app (`apps/web`)

```bash
cd apps/web
pnpm dev
```

Chạy tại `http://localhost:3000`. Cấu hình API qua `apps/web/.env.local`
(`NEXT_PUBLIC_API_URL=http://localhost:3001/api`).

Trang chính: `/login`, `/book` (khách đặt xe), `/trips` (khách theo dõi chuyến),
`/driver` (bảng điều khiển tài xế), `/admin` (quản trị đội xe/chuyến đi, chỉ role ADMIN).

## 4. Mobile app cho tài xế (`apps/mobile`)

```bash
cd apps/mobile
npx expo start
```

Dùng Expo Go hoặc emulator để quét mã QR. Cấu hình API qua `apps/mobile/.env`
(`EXPO_PUBLIC_API_URL`):

- Android emulator: `http://10.0.2.2:3001/api`
- Thiết bị thật (cùng mạng LAN): `http://<IP-máy>:3001/api`
- iOS simulator: `http://localhost:3001/api` (mặc định)

Màn hình: đăng nhập/đăng ký tài xế → dashboard (thêm xe, bật/tắt trực, xem & nhận chuyến
khả dụng) → chi tiết chuyến (tiến trình trạng thái chuyến).

## Luồng demo end-to-end

1. Đăng ký 1 tài khoản `CUSTOMER` và 1 tài khoản `DRIVER` (web `/login` hoặc mobile).
2. Tài xế: thêm xe (`/driver` hoặc app mobile), bật trạng thái "Đang trực".
3. Khách hàng: vào `/book`, nhập điểm đón/trả, đặt xe → hệ thống tự tính quãng đường & giá cước.
4. Tài xế: thấy chuyến trong danh sách "Chuyến khả dụng", bấm "Nhận chuyến".
5. Tài xế: tiến trình qua các trạng thái tới "Hoàn thành chuyến" → hệ thống tự tạo bản ghi thanh toán.
6. Khách hàng: xem lịch sử tại `/trips`. Admin: xem toàn bộ tài xế/xe/chuyến tại `/admin`.

## Roadmap (các giai đoạn tiếp theo)

- Xe ghép (SHARED) với ghép nhiều khách trên cùng tuyến.
- AI tự ghép khách & tối ưu tuyến đường.
- Bản đồ thời gian thực (vị trí tài xế, theo dõi chuyến trực tiếp).
- Thanh toán online (ví điện tử / cổng thanh toán), đối soát tài xế.
- Đánh giá, khiếu nại, thông báo đẩy (push notification).
