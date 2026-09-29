# GhepGo

Nền tảng đặt xe & ghép xe (ride-hailing / carpool platform).

Tiến độ theo lộ trình:

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1. Nền móng | Auth, đặt bao xe, app tài xế, admin, thanh toán tiền mặt | ✅ |
| 2. Ghép khách | Ghép theo tuyến/hướng, chia giá theo quãng đường, UI điểm dừng | ✅ |
| 3. Tối ưu tuyến & realtime | Tối ưu thứ tự đón/trả (exact + 2-opt), ghép động khi xe đang chạy, GPS realtime qua Socket.io + Redis pub/sub, huỷ chuyến | ✅ (chưa có demand forecasting) |
| 4. Đội xe nâng cao + thanh toán | Ví & sổ cái, nạp qua cổng (mock, cùng luồng callback VNPay/Momo), hoa hồng, rút tiền, ca làm việc, khu vực, KPI, đánh giá, báo cáo đối soát | ✅ (cổng thật chưa tích hợp) |
| 5. Mở rộng | A/B test thuật toán, microservices, CSKH | ⏳ |

Bản đồ: lớp `GeoService` có thể cắm provider — mặc định **OSM** (Nominatim + OSRM, không cần key, chỉ dùng dev),
đặt `GEO_PROVIDER=goong` + `GOONG_API_KEY` để chuyển sang Goong. Quãng đường/ETA lấy từ routing thật, fallback đường chim bay ×1.3.

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
- **Drivers**: `PATCH /drivers/me/status` (AVAILABLE/OFFLINE), `PATCH /drivers/me/location`
  (fallback HTTP cho GPS), `GET /drivers/nearby?lat&lng&radius` (tài xế đang trực quanh một điểm,
  Redis GEO), `GET /drivers` (admin, kèm vị trí live).
- **Trips**: `POST /trips` (đặt xe, tự tính khoảng cách/giá bằng công thức Haversine),
  `GET /trips/mine`, `GET /trips/available`, `GET /trips/driver/mine`,
  `POST /trips/:id/accept` (atomic — 2 tài xế bấm cùng lúc chỉ 1 người nhận được),
  `PATCH /trips/:id/status`, `POST /trips/:id/cancel` (khách huỷ trước khi được đón),
  `GET /trips/all` (admin).
- **Trip groups (xe ghép)**: `GET /trip-groups/available`, `GET /trip-groups/mine`,
  `POST /trip-groups/:id/accept`, `PATCH /trip-groups/:id/advance` (đánh dấu xong điểm dừng kế tiếp).
- **Geo**: `GET /geo/autocomplete?q&lat&lng`, `GET /geo/route?fromLat&fromLng&toLat&toLng`, `GET /geo/provider`.
- **Wallet**: `GET /wallet/me`, `GET /wallet/me/transactions`, `POST /wallet/topup` (tạo giao dịch PENDING + URL cổng),
  `POST /wallet/topup/callback` (IPN, xác thực HMAC-SHA256 bằng `PAYMENT_WEBHOOK_SECRET`, idempotent),
  `POST /wallet/trips/:id/confirm-cash` (tài xế xác nhận đã thu tiền mặt),
  `POST /wallet/withdrawals` + `GET /wallet/withdrawals/mine` (tài xế), `GET/PATCH /wallet/withdrawals[/:id]` (admin duyệt).
- **Fleet / báo cáo**: `GET /drivers/me/stats`, `GET /drivers/me/shifts`, `POST /trips/:id/rating`,
  `GET /admin/reports/overview?from&to`, `GET /admin/drivers/:id/stats`, `GET/POST /admin/zones`, `PATCH /admin/drivers/:id/zone`.

Trạng thái chuyến đi: `REQUESTED → ACCEPTED → EN_ROUTE_TO_PICKUP → IN_PROGRESS → COMPLETED`
(hoặc `CANCELLED`), được validate ở server.

Toàn bộ response tự động loại bỏ field `passwordHash` qua `StripSensitiveInterceptor`.

### Ghép khách & tối ưu tuyến (`src/matching`, `src/common/route.util.ts`)

- **Bucketing rule-based**: điểm đón/trả của khách mới phải cách một điểm dừng *chưa đi qua* của
  nhóm ≤ 3 km; nhóm còn đủ ghế (theo xe thực tế nếu đã có tài xế).
- **Tối ưu thứ tự dừng**: tìm kiếm chính xác (branch & bound) với ràng buộc đón-trước-trả khi ≤ 10
  điểm dừng, ngoài ra dùng nearest-neighbour + 2-opt. Khách vào nhóm làm tuyến dài thêm ít nhất,
  trong ngưỡng detour `max(2 km, 60% quãng đường riêng)`.
- **Ghép động (dynamic re-matching)**: nhóm đã có tài xế (`ASSIGNED`/`IN_PROGRESS`) vẫn nhận thêm
  khách; các điểm đã đi qua bị đóng băng, vị trí GPS live của tài xế (Redis) làm gốc tính tuyến.
  Khách mới được gán luôn tài xế/xe, trạng thái `ACCEPTED`.
- **Giá công bằng**: mỗi khách trả `75% giá bao xe của quãng đường riêng + phụ phí detour họ gây ra`.
- **Chống race**: optimistic lock trên `seatsUsed/currentStopIndex/status` của nhóm, retry 2 lần.
- **Huỷ chuyến ghép**: gỡ điểm dừng của khách, trả ghế, tối ưu lại phần tuyến còn lại; nhóm rỗng → `CANCELLED`.

### Ví & thanh toán (`src/wallet`)

- Sổ cái append-only `wallet_transactions` (số tiền có dấu + `balanceAfter`), mọi thay đổi số dư đi qua
  `SELECT ... FOR UPDATE` trên ví nên không double-spend khi nhiều request song song.
- Khi chuyến `COMPLETED` → `settleTrip`: **WALLET** trừ ví khách, cộng ví tài xế `fare − hoa hồng`
  (`COMMISSION_RATE`, mặc định 20%), payment `PAID`; ví khách không đủ → tự chuyển sang **CASH**.
  **CASH** tài xế thu tiền, ví tài xế bị trừ hoa hồng (được phép âm = nợ nền tảng), payment `PENDING`
  tới khi tài xế bấm xác nhận đã thu.
- Nạp ví: tạo giao dịch `PENDING` → cổng thanh toán gọi callback có chữ ký → cộng tiền. Dev dùng trang
  `/wallet/mock-checkout` trên web để giả lập; production chỉ cần thay bước tạo URL + verify chữ ký theo VNPay/Momo.
- Rút tiền: giữ tiền ngay khi tài xế yêu cầu, admin `APPROVED → PAID` hoặc `REJECTED` (hoàn tiền), mỗi tài xế 1 yêu cầu mở.

### Vận hành đội xe (`src/fleet`)

- Ca làm việc tự mở/đóng khi tài xế bật/tắt trực → giờ trực trong KPI.
- Khu vực hoạt động (tâm + bán kính) gán cho tài xế; KPI theo khoảng thời gian: chuyến, tỷ lệ huỷ,
  doanh thu gộp/thực nhận, hoa hồng đã trả, giờ trực, chuyến/giờ, đánh giá.
- Báo cáo admin: tổng quan doanh thu, series theo ngày, đối soát theo phương thức/trạng thái thanh toán, top tài xế,
  trạng thái đội xe, rút tiền chờ duyệt.

### Realtime (`src/realtime`, `src/redis`)

- Socket.io namespace **`/realtime`** cùng origin API (ví dụ `ws://localhost:3001/realtime`),
  xác thực bằng JWT trong `auth.token` khi handshake.
- Vị trí tài xế **không ghi DB liên tục**: lưu Redis (GEO set `drivers:geo` + hash TTL 120s),
  phát qua Redis pub/sub kênh `ghepgo:events`, gateway fan-out tới room `trip:<id>`, `group:<id>`,
  `admins`. PostgreSQL chỉ nhận bản sao thô mỗi 30s. Nhiều instance API chạy song song vẫn đúng.
- Sự kiện server → client: `driver:location`, `trip:new`, `trip:updated`, `group:new`, `group:updated`.
  Client → server: `location:update` (tài xế), `subscribe:trip`, `subscribe:group` (kiểm tra quyền sở hữu).
- Kiểu dữ liệu sự kiện: `packages/shared/src/index.ts`.

## 3. Web app (`apps/web`)

```bash
cd apps/web
pnpm dev
```

Chạy tại `http://localhost:3000`. Cấu hình API qua `apps/web/.env.local`
(`NEXT_PUBLIC_API_URL=http://localhost:3001/api`).

Trang chính: `/login`, `/book` (khách đặt xe: autocomplete địa chỉ, xem quãng đường/giá dự kiến, chọn tiền mặt/ví,
số tài xế đang trực quanh điểm đón), `/wallet` (khách: nạp ví, lịch sử; tài xế: KPI, rút tiền), `/admin/reports`
(báo cáo, duyệt rút tiền, khu vực),
`/trips` (khách theo dõi chuyến realtime: trạng thái, lộ trình nhóm ghép, vị trí tài xế, huỷ chuyến),
`/driver` (bảng điều khiển tài xế: gửi GPS trình duyệt khi bật trực, nhận bao xe/nhóm ghép,
tiến điểm dừng), `/admin` (quản trị đội xe/chuyến đi kèm vị trí live, chỉ role ADMIN).

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

Màn hình: đăng nhập/đăng ký tài xế → dashboard (thêm xe, bật/tắt trực — khi trực app gửi GPS
qua `expo-location` + Socket.io, nhận bao xe hoặc nhóm ghép) → chi tiết chuyến bao xe
(`trip/[id]`, có nút xác nhận thu tiền mặt) hoặc chuyến ghép (`group/[id]`: danh sách điểm dừng, nút "Đã đón/Đã trả"),
màn `earnings` (số dư, KPI, rút tiền, lịch sử).
Theo dõi GPS hiện chỉ chạy foreground; background tracking để giai đoạn sau.

## Luồng demo end-to-end

1. Đăng ký 1 tài khoản `CUSTOMER` và 1 tài khoản `DRIVER` (web `/login` hoặc mobile).
2. Tài xế: thêm xe (`/driver` hoặc app mobile), bật trạng thái "Đang trực".
3. Khách hàng: vào `/book`, nhập điểm đón/trả, đặt xe → hệ thống tự tính quãng đường & giá cước.
4. Tài xế: thấy chuyến trong danh sách "Chuyến khả dụng", bấm "Nhận chuyến".
5. Tài xế: tiến trình qua các trạng thái tới "Hoàn thành chuyến" → hệ thống tự tạo bản ghi thanh toán.
6. Khách hàng: xem lịch sử tại `/trips`. Admin: xem toàn bộ tài xế/xe/chuyến tại `/admin`.

## Kiểm thử

```bash
cd apps/api
pnpm test          # unit (vitest) — gồm test tối ưu tuyến route.util.spec.ts
pnpm build
```

Smoke test thủ công end-to-end (API + Redis + Socket.io) đã chạy: 2 khách ghép chung nhóm →
tài xế nhận → đón khách 1 → khách 3 đặt giữa chừng được ghép vào xe đang chạy → khách 2 huỷ →
hoàn thành; race 2 tài xế nhận 1 chuyến chỉ 1 thành công; sự kiện realtime tới đúng khách/tài xế.

Smoke test Giai đoạn 4 đã chạy: nạp ví qua callback ký HMAC (replay idempotent, chữ ký sai bị từ chối),
chuyến ví trừ đúng `fare` / cộng tài xế `fare×0.8`, chuyến tiền mặt trừ hoa hồng, ví thiếu tự chuyển tiền mặt,
đánh giá 1 lần/chuyến, rút tiền giữ số dư → admin duyệt → đã chuyển, khu vực & KPI.

## Roadmap (việc còn lại)

- **Cổng thanh toán thật**: tích hợp VNPay/Momo sandbox vào `WalletService.createTopup` + verify chữ ký theo tài liệu cổng.
- **Bản đồ**: lấy Goong API key (hoặc Mapbox) cho production; vẽ bản đồ/polyline trên web & mobile (hiện chỉ toạ độ + link).
- **Giai đoạn 3 còn lại**: dự báo nhu cầu theo khung giờ/khu vực (cần dữ liệu thực); cân nhắc OR-Tools
  khi nhóm > 5 khách hoặc ghép nhiều xe.
- OTP/SMS khi đăng ký, khiếu nại, push notification, GPS background trên mobile, ràng buộc khu vực khi ghép chuyến.
- Nominatim công cộng có thể bị chặn theo mạng (autocomplete rỗng) — dùng Goong hoặc self-host Nominatim.
- PostGIS đang bật extension nhưng chưa dùng cho query (Redis GEO + Haversine đủ cho quy mô hiện tại).
