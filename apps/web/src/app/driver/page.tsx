"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { useDriverLocationStream, useRealtime, useSocketEvent, WS } from "@/lib/realtime";
import { TripMap } from "@/components/trip-map";
import { MapView, type MapMarker } from "@/components/map-view";
import { useMapTiles } from "@/lib/map";
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Field, Icon, Input, LiveDot, PageHeader, RouteLine, Stat, type Tone } from "@/components/ui";

const NEXT_ACTION: Record<string, { next: string; label: string }> = {
  ACCEPTED: { next: "EN_ROUTE_TO_PICKUP", label: "Bắt đầu tới điểm đón" },
  EN_ROUTE_TO_PICKUP: { next: "IN_PROGRESS", label: "Đã đón khách, bắt đầu chuyến" },
  IN_PROGRESS: { next: "COMPLETED", label: "Hoàn thành chuyến" },
};
const TRIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACCEPTED: { label: "Đã nhận", tone: "blue" },
  EN_ROUTE_TO_PICKUP: { label: "Đang tới đón", tone: "blue" },
  IN_PROGRESS: { label: "Đang chở khách", tone: "brand" },
  COMPLETED: { label: "Hoàn thành", tone: "green" },
  CANCELLED: { label: "Đã huỷ", tone: "slate" },
};
const GROUP_STATUS: Record<string, string> = { ASSIGNED: "Chuẩn bị đón", IN_PROGRESS: "Đang chạy" };
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

function StopList({ stops, currentStopIndex }: { stops: any[]; currentStopIndex: number }) {
  return (
    <ol className="text-sm mt-3 space-y-1.5">
      {stops.map((s, i) => {
        const done = i < currentStopIndex;
        const current = i === currentStopIndex;
        return (
          <li key={s.id} className={`flex gap-2.5 items-start ${done ? "text-ink-400 line-through" : current ? "text-ink-900 font-medium" : "text-ink-600"}`}>
            <span
              className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-[11px] flex items-center justify-center ${
                done ? "bg-ink-200 text-ink-500" : s.kind === "PICKUP" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"
              } ${current ? "ring-4 ring-brand-500/15" : ""}`}
            >
              {i + 1}
            </span>
            <span>
              <span className={`text-[11px] uppercase tracking-wide mr-1.5 ${s.kind === "PICKUP" ? "text-emerald-700" : "text-orange-700"}`}>{s.kind === "PICKUP" ? "Đón" : "Trả"}</span>
              {s.address}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function DriverPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const { socket, connected } = useRealtime(token);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [myTrips, setMyTrips] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [status, setStatus] = useState<"OFFLINE" | "AVAILABLE" | "ON_TRIP">("OFFLINE");
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const { lastFix, geoError } = useDriverLocationStream(socket, status !== "OFFLINE");
  const tiles = useMapTiles(token);

  const refresh = useCallback(() => {
    if (!token) return;
    api.myVehicles(token).then(setVehicles).catch(() => {});
    api.availableTrips(token).then(setAvailable).catch(() => {});
    api.myDriverTrips(token).then(setMyTrips).catch(() => {});
    api.availableGroups(token).then(setAvailableGroups).catch(() => {});
    api.myGroups(token).then(setMyGroups).catch(() => {});
    api.myDriverStats(token).then(setStats).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api
      .driverMe(token)
      .then((d) => {
        setStatus(d.status);
        setZoneName(d.zone?.name ?? null);
      })
      .catch(() => {});
    refresh();
    // Realtime events drive refreshes; the slow interval is only a safety net.
    const interval = setInterval(refresh, 20000);
    return () => clearInterval(interval);
  }, [token, refresh]);

  useSocketEvent(socket, WS.TRIP_NEW, refresh);
  useSocketEvent(socket, WS.TRIP_UPDATED, refresh);
  useSocketEvent(socket, WS.GROUP_NEW, refresh);
  useSocketEvent(socket, WS.GROUP_UPDATED, refresh);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const run = async (fn: () => Promise<unknown>) => {
    if (!token) return;
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const onAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.registerVehicle(token!, { plateNumber, make, model });
      setPlateNumber("");
      setMake("");
      setModel("");
      setShowVehicleForm(false);
    });
  };

  const toggleStatus = () =>
    run(async () => {
      const nextStatus = status === "OFFLINE" ? "AVAILABLE" : "OFFLINE";
      await api.updateDriverStatus(token!, nextStatus);
      setStatus(nextStatus);
    });

  const activeTrips = myTrips.filter((t) => t.tripType === "PRIVATE" && !["COMPLETED", "CANCELLED"].includes(t.status));
  const recentDone = myTrips.filter((t) => ["COMPLETED", "CANCELLED"].includes(t.status)).slice(0, 5);
  const cashToConfirm = myTrips.filter((t) => t.status === "COMPLETED" && t.payment?.method === "CASH" && t.payment?.status === "PENDING");
  const myLocation = lastFix ? { lat: lastFix.lat, lng: lastFix.lng } : null;
  const idleMarkers: MapMarker[] = [
    ...(lastFix ? [{ id: "me", kind: "me" as const, lat: lastFix.lat, lng: lastFix.lng, title: "Vị trí của bạn" }] : []),
    ...available.map((t) => ({ id: `t-${t.id}`, kind: "trip" as const, lat: t.pickupLat, lng: t.pickupLng, label: "!", title: `Bao xe · ${t.pickupAddress} · ${vnd(t.fare)}` })),
    ...availableGroups.flatMap((g) =>
      g.stops.filter((s: any) => s.kind === "PICKUP").map((s: any) => ({ id: `g-${s.id}`, kind: "stop" as const, lat: s.lat, lng: s.lng, label: "G", title: `Nhóm ghép ${g.trips.length} khách · ${s.address}` })),
    ),
  ];
  const online = status !== "OFFLINE";
  const busyWith = myGroups[0] ? "group" : activeTrips[0] ? "trip" : null;

  return (
    <div>
      <PageHeader title={`Xin chào, ${user?.fullName?.split(" ").slice(-1)[0] ?? "tài xế"}`} description={zoneName ? `Khu vực hoạt động: ${zoneName}` : "Bạn nhận chuyến ở mọi khu vực."} action={<LiveDot connected={connected} />} />
      {error && <Alert className="mb-4">{error}</Alert>}

      {/* Duty toggle */}
      <div className={`rounded-3xl p-5 sm:p-6 text-white mb-5 ${online ? "gradient-brand" : "bg-ink-900"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className={`relative h-12 w-12 rounded-2xl flex items-center justify-center ${online ? "bg-white/15" : "bg-white/10"}`}>
              <Icon.car className="h-6 w-6" />
              {online && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-brand-700" />}
            </span>
            <div>
              <p className="text-lg font-semibold">{status === "AVAILABLE" ? "Đang trực" : status === "ON_TRIP" ? "Đang chạy chuyến" : "Ngoại tuyến"}</p>
              <p className="text-sm text-white/70">
                {!online
                  ? "Bật trực để bắt đầu nhận chuyến và gửi vị trí GPS"
                  : lastFix
                    ? `GPS ${lastFix.lat.toFixed(4)}, ${lastFix.lng.toFixed(4)} · đang gửi vị trí`
                    : geoError
                      ? `GPS lỗi: ${geoError}`
                      : "Đang lấy vị trí GPS…"}
              </p>
            </div>
          </div>
          <Button onClick={toggleStatus} disabled={status === "ON_TRIP" || vehicles.length === 0} size="lg" className={online ? "bg-white text-brand-800 hover:bg-brand-50" : "bg-brand-500 text-white hover:bg-brand-400"}>
            {online ? "Ngừng trực" : "Bắt đầu trực"}
          </Button>
        </div>
        {vehicles.length === 0 && <p className="mt-3 text-xs text-amber-200">Thêm xe bên dưới trước khi bật trực.</p>}
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Stat label="Chuyến 30 ngày" value={stats.trips.completed} icon={<Icon.route className="h-5 w-5" />} tone="brand" />
          <Stat label="Thực nhận" value={vnd(stats.netEarnings)} icon={<Icon.wallet className="h-5 w-5" />} tone="green" />
          <Stat label="Giờ trực" value={`${stats.onlineHours} h`} icon={<Icon.clock className="h-5 w-5" />} tone="blue" />
          <Stat label="Đánh giá" value={`${stats.driver.ratingAvg} ★`} hint={`${stats.driver.ratingCount} lượt`} icon={<Icon.star className="h-5 w-5" />} tone="amber" />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        {/* Left: map + current job */}
        <div className="flex flex-col gap-5">
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink-900">{busyWith === "group" ? "Lộ trình chuyến ghép" : busyWith === "trip" ? "Lộ trình chuyến bao xe" : "Bản đồ nhu cầu"}</h2>
              {busyWith && <Badge tone="brand" dot>Đang thực hiện</Badge>}
            </div>
            <div className="px-2 pb-2">
              {busyWith === "group" ? (
                <TripMap token={token} group={myGroups[0]} myLocation={myLocation} height={340} />
              ) : busyWith === "trip" ? (
                <TripMap token={token} trip={activeTrips[0]} myLocation={myLocation} height={340} />
              ) : (
                <MapView tiles={tiles} markers={idleMarkers} center={myLocation ?? undefined} fitKey={`${available.length}:${availableGroups.length}`} height={340} />
              )}
            </div>
            <p className="px-5 pb-4 text-[11px] text-ink-500">Tím: bạn · A/B: đón/trả · số: thứ tự điểm dừng · &quot;!&quot; bao xe đang chờ · &quot;G&quot; nhóm ghép đang chờ</p>
          </Card>

          {myGroups.map((g) => {
            const nextStop = g.stops[g.currentStopIndex];
            return (
              <Card key={g.id}>
                <CardTitle description={`${g.trips.length} khách · ${g.seatsUsed} ghế · ${((g.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km`} action={<Badge tone="brand">{GROUP_STATUS[g.status] ?? g.status}</Badge>}>
                  Chuyến ghép đang thực hiện
                </CardTitle>
                <StopList stops={g.stops} currentStopIndex={g.currentStopIndex} />
                {nextStop && (
                  <Button size="lg" className="w-full mt-4" onClick={() => run(() => api.advanceGroup(token!, g.id))}>
                    <Icon.check className="h-5 w-5" />
                    {nextStop.kind === "PICKUP" ? "Đã đón" : "Đã trả"} khách tại điểm {g.currentStopIndex + 1}
                  </Button>
                )}
              </Card>
            );
          })}

          {activeTrips.map((trip) => {
            const st = TRIP_STATUS[trip.status] ?? { label: trip.status, tone: "slate" as Tone };
            return (
              <Card key={trip.id}>
                <CardTitle description={`${vnd(trip.fare)} · ${trip.paymentMethod === "WALLET" ? "ví" : "tiền mặt"} · ${trip.customer?.fullName ?? "Khách"}`} action={<Badge tone={st.tone} dot>{st.label}</Badge>}>
                  Chuyến bao xe đang thực hiện
                </CardTitle>
                <RouteLine pickup={trip.pickupAddress} dropoff={trip.dropoffAddress} />
                {NEXT_ACTION[trip.status] && (
                  <Button size="lg" className="w-full mt-4" onClick={() => run(() => api.updateTripStatus(token!, trip.id, NEXT_ACTION[trip.status].next))}>
                    {NEXT_ACTION[trip.status].label}
                    <Icon.arrowRight className="h-5 w-5" />
                  </Button>
                )}
              </Card>
            );
          })}

          {cashToConfirm.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardTitle description="Phí nền tảng của chuyến tiền mặt được trừ vào ví.">Xác nhận đã thu tiền mặt</CardTitle>
              <ul className="divide-y divide-amber-100">
                {cashToConfirm.map((t) => (
                  <li key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{t.customer?.fullName ?? "Khách"}</span> · {t.pickupAddress} → {t.dropoffAddress}
                    </span>
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => run(() => api.confirmCash(token!, t.id))}>
                      Đã thu {vnd(t.fare)}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right: offers + vehicle */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardTitle description="Lộ trình đã tối ưu, nhận cả nhóm một lần." action={<Badge tone="slate">{availableGroups.length}</Badge>}>
              Nhóm xe ghép chờ tài xế
            </CardTitle>
            {availableGroups.length === 0 && <EmptyState icon={<Icon.users className="h-6 w-6" />} title="Chưa có nhóm nào" description="Nhóm mới sẽ hiện ngay tại đây." />}
            <div className="flex flex-col gap-3">
              {availableGroups.map((g) => (
                <div key={g.id} className="rounded-2xl border border-ink-200/70 p-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-ink-900">
                      {g.trips.length} khách · {g.seatsUsed} ghế · {((g.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km
                    </span>
                    <span className="font-semibold text-brand-700">{vnd(g.trips.reduce((sum: number, t: any) => sum + Number(t.fare), 0))}</span>
                  </div>
                  {g.zone?.name && <p className="text-xs text-ink-500 mt-0.5">Khu vực {g.zone.name}</p>}
                  <StopList stops={g.stops} currentStopIndex={0} />
                  <Button className="w-full mt-3" onClick={() => run(() => api.acceptGroup(token!, g.id))} disabled={!online}>
                    Nhận nhóm chuyến
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle description="Chuyến riêng gần bạn, ai bấm trước nhận trước." action={<Badge tone="slate">{available.length}</Badge>}>
              Chuyến bao xe khả dụng
            </CardTitle>
            {available.length === 0 && <EmptyState icon={<Icon.car className="h-6 w-6" />} title="Chưa có chuyến nào" description="Bật trực để được thông báo khi có chuyến mới." />}
            <div className="flex flex-col gap-3">
              {available.map((trip) => (
                <div key={trip.id} className="rounded-2xl border border-ink-200/70 p-4">
                  <RouteLine pickup={trip.pickupAddress} dropoff={trip.dropoffAddress} />
                  <div className="flex items-center justify-between mt-3 text-sm">
                    <span className="text-ink-500">
                      {(trip.distanceMeters / 1000).toFixed(1)} km{trip.pickupZone?.name ? ` · ${trip.pickupZone.name}` : ""}
                    </span>
                    <span className="font-semibold text-brand-700">{vnd(trip.fare)}</span>
                  </div>
                  <Button className="w-full mt-3" onClick={() => run(() => api.acceptTrip(token!, trip.id))} disabled={!online}>
                    Nhận chuyến
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle action={<Button variant="soft" size="sm" onClick={() => setShowVehicleForm((v) => !v)}>{showVehicleForm ? "Đóng" : "Thêm xe"}</Button>}>Xe của tôi</CardTitle>
            {vehicles.length === 0 && !showVehicleForm && <p className="text-sm text-ink-500">Chưa có xe nào. Thêm xe để bắt đầu trực.</p>}
            <ul className="divide-y divide-ink-100">
              {vehicles.map((v) => (
                <li key={v.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="h-9 w-9 rounded-xl bg-ink-100 text-ink-600 flex items-center justify-center">
                    <Icon.car className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="font-semibold text-ink-900 font-mono">{v.plateNumber}</span>
                    <span className="block text-xs text-ink-500">
                      {v.make} {v.model} · {v.seats} chỗ
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {showVehicleForm && (
              <form onSubmit={onAddVehicle} className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-ink-100">
                <Field label="Biển số" className="col-span-2">
                  <Input placeholder="51H-123.45" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} required />
                </Field>
                <Field label="Hãng xe">
                  <Input placeholder="Toyota" value={make} onChange={(e) => setMake(e.target.value)} required />
                </Field>
                <Field label="Dòng xe">
                  <Input placeholder="Vios" value={model} onChange={(e) => setModel(e.target.value)} required />
                </Field>
                <Button type="submit" className="col-span-2">Lưu xe</Button>
              </form>
            )}
          </Card>

          {recentDone.length > 0 && (
            <Card>
              <CardTitle>Chuyến gần đây</CardTitle>
              <ul className="divide-y divide-ink-100 text-sm">
                {recentDone.map((t) => {
                  const st = TRIP_STATUS[t.status] ?? { label: t.status, tone: "slate" as Tone };
                  return (
                    <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-800">{t.pickupAddress} → {t.dropoffAddress}</span>
                        <span className="text-xs text-ink-500">{vnd(t.fare)} · {t.customer?.fullName ?? ""}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <a href={`/complaints?tripId=${t.id}`} className="text-xs text-ink-400 hover:text-ink-700">Báo cáo</a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
