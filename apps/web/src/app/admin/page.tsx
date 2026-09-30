"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { useRealtime, useSocketEvent, WS, type DriverLocation } from "@/lib/realtime";
import { MapView, type MapCircle, type MapMarker, type MapPolygon } from "@/components/map-view";
import { useMapTiles } from "@/lib/map";
import { Avatar, Badge, Card, Icon, LiveDot, PageHeader, Stat, type Tone } from "@/components/ui";

const ACTIVE_TRIP = ["REQUESTED", "ASSIGNED", "ACCEPTED", "EN_ROUTE_TO_PICKUP", "IN_PROGRESS"];
const DRIVER_STATUS: Record<string, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Đang trực", tone: "green" },
  ON_TRIP: { label: "Đang chạy", tone: "brand" },
  OFFLINE: { label: "Ngoại tuyến", tone: "slate" },
};
const TRIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Chờ tài xế", tone: "amber" },
  ASSIGNED: { label: "Đã ghép nhóm", tone: "amber" },
  ACCEPTED: { label: "Đã nhận", tone: "blue" },
  EN_ROUTE_TO_PICKUP: { label: "Đang tới đón", tone: "blue" },
  IN_PROGRESS: { label: "Đang chạy", tone: "brand" },
  COMPLETED: { label: "Hoàn thành", tone: "green" },
  CANCELLED: { label: "Đã huỷ", tone: "slate" },
};
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

export default function AdminPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [locations, setLocations] = useState<Record<string, DriverLocation>>({});
  const [zones, setZones] = useState<any[]>([]);
  const [tab, setTab] = useState<"drivers" | "trips" | "vehicles">("drivers");
  const { socket, connected } = useRealtime(token);
  const tiles = useMapTiles(token);

  const load = useCallback(() => {
    if (!token) return;
    api.allDrivers(token).then(setDrivers).catch(() => {});
    api.allVehicles(token).then(setVehicles).catch(() => {});
    api.allTrips(token).then(setTrips).catch(() => {});
    api.zones(token).then(setZones).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // Admins are in the "admins" room: every trip/group change and every GPS fix arrives here.
  useSocketEvent(socket, WS.TRIP_NEW, load);
  useSocketEvent(socket, WS.TRIP_UPDATED, load);
  useSocketEvent(socket, WS.GROUP_UPDATED, load);
  useSocketEvent<DriverLocation>(socket, WS.DRIVER_LOCATION, (loc) => setLocations((prev) => ({ ...prev, [loc.driverId]: loc })));

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const markers: MapMarker[] = [];
  for (const d of drivers) {
    if (d.status === "OFFLINE") continue;
    const live = locations[d.id];
    const lat = live?.lat ?? d.currentLat;
    const lng = live?.lng ?? d.currentLng;
    if (lat == null || lng == null) continue;
    markers.push({
      id: `d-${d.id}`,
      kind: "driver",
      lat: Number(lat),
      lng: Number(lng),
      heading: live?.heading,
      title: `${d.user?.fullName} · ${DRIVER_STATUS[d.status]?.label ?? d.status}${d.zone?.name ? ` · ${d.zone.name}` : ""}${live ? "" : " · vị trí cũ"}`,
    });
  }
  const activeTrips = trips.filter((t) => ACTIVE_TRIP.includes(t.status));
  for (const t of activeTrips) {
    markers.push({ id: `t-${t.id}`, kind: t.status === "REQUESTED" ? "trip" : "pickup", lat: t.pickupLat, lng: t.pickupLng, label: t.tripType === "SHARED" ? "G" : "!", title: `${t.customer?.fullName} · ${TRIP_STATUS[t.status]?.label ?? t.status} · ${t.pickupAddress}` });
  }
  const polygons: MapPolygon[] = [];
  const circles: MapCircle[] = [];
  for (const z of zones) {
    if (!z.isActive) continue;
    const ring = z.polygon?.coordinates?.[0];
    if (ring) polygons.push({ id: z.id, ring: ring.map(([lng, lat]: [number, number]) => ({ lat, lng })), title: z.name, color: "#0891b2" });
    else circles.push({ id: z.id, center: { lat: z.centerLat, lng: z.centerLng }, radiusMeters: z.radiusKm * 1000, title: z.name, color: "#0891b2" });
  }

  const online = drivers.filter((d) => d.status === "AVAILABLE").length;
  const onTrip = drivers.filter((d) => d.status === "ON_TRIP").length;
  const waiting = trips.filter((t) => ["REQUESTED", "ASSIGNED"].includes(t.status)).length;

  return (
    <div>
      <PageHeader eyebrow="Quản trị" title="Đội xe & vận hành" description="Vị trí tài xế, chuyến đang chờ và khu vực phục vụ theo thời gian thực." action={<LiveDot connected={connected} />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Tài xế đang trực" value={online} icon={<Icon.car className="h-5 w-5" />} tone="green" />
        <Stat label="Đang chở khách" value={onTrip} icon={<Icon.navigation className="h-5 w-5" />} tone="brand" />
        <Stat label="Chuyến chờ tài xế" value={waiting} icon={<Icon.clock className="h-5 w-5" />} tone={waiting > 0 ? "amber" : "slate"} />
        <Stat label="Chuyến đang diễn ra" value={activeTrips.length} icon={<Icon.route className="h-5 w-5" />} tone="blue" />
      </div>

      <Card padded={false} className="overflow-hidden mb-5">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">Bản đồ đội xe</h2>
          <span className="text-xs text-ink-500">{markers.filter((m) => m.kind === "driver").length} xe trên bản đồ</span>
        </div>
        <div className="px-2 pb-2">
          <MapView tiles={tiles} markers={markers} polygons={polygons} circles={circles} fitKey={`${zones.length}:${drivers.length}`} height={460} />
        </div>
        <p className="px-5 pb-4 text-[11px] text-ink-500">Mũi tên xanh: tài xế (GPS trực tiếp) · &quot;!&quot; bao xe chờ · &quot;G&quot; nhóm ghép · A: điểm đón chuyến đã có tài xế · vùng lam: khu vực hoạt động.</p>
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-4 pb-2 flex items-center gap-1 border-b border-ink-100">
          {(
            [
              ["drivers", `Tài xế (${drivers.length})`],
              ["trips", `Chuyến đi (${trips.length})`],
              ["vehicles", `Xe (${vehicles.length})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 rounded-lg text-sm font-medium transition ${tab === k ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-3 sm:p-4 overflow-x-auto">
          {tab === "drivers" && (
            <table className="table">
              <thead>
                <tr>
                  <th>Tài xế</th>
                  <th>Trạng thái</th>
                  <th>Khu vực</th>
                  <th>Xe</th>
                  <th>Đánh giá</th>
                  <th>Vị trí</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const live = locations[d.id];
                  const lat = live?.lat ?? d.currentLat;
                  const lng = live?.lng ?? d.currentLng;
                  const st = DRIVER_STATUS[d.status] ?? { label: d.status, tone: "slate" as Tone };
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={d.user?.fullName} size={32} />
                          <span>
                            <span className="block font-medium text-ink-900">{d.user?.fullName}</span>
                            <span className="text-xs text-ink-500">{d.user?.phone}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="text-ink-600">{d.zone?.name ?? <span className="text-ink-400">Mọi khu vực</span>}</td>
                      <td className="text-ink-600 font-mono text-xs">{d.vehicles?.map((v: any) => v.plateNumber).join(", ") || "—"}</td>
                      <td className="text-ink-600">{d.ratingCount ? `${Number(d.ratingAvg).toFixed(1)} ★` : "—"}</td>
                      <td className="text-xs font-mono text-ink-500">
                        {lat != null && lng != null ? (
                          <span className={live ? "text-emerald-700" : ""}>
                            {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                            {live ? " ●" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {tab === "trips" && (
            <table className="table">
              <thead>
                <tr>
                  <th>Khách</th>
                  <th>Lộ trình</th>
                  <th>Loại</th>
                  <th>Tài xế</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Giá</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => {
                  const st = TRIP_STATUS[t.status] ?? { label: t.status, tone: "slate" as Tone };
                  return (
                    <tr key={t.id}>
                      <td className="font-medium text-ink-900">{t.customer?.fullName}</td>
                      <td className="text-ink-600 max-w-[280px]">
                        <span className="block truncate">{t.pickupAddress}</span>
                        <span className="block truncate text-xs text-ink-400">→ {t.dropoffAddress}</span>
                      </td>
                      <td>{t.tripType === "SHARED" ? <Badge tone="violet">Ghép · {t.group?.trips?.length ?? "?"} khách</Badge> : <Badge tone="slate">Bao xe</Badge>}</td>
                      <td className="text-ink-600">{t.driver?.user?.fullName ?? "—"}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="text-right font-semibold text-ink-900">{vnd(t.fare)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {tab === "vehicles" && (
            <table className="table">
              <thead>
                <tr>
                  <th>Biển số</th>
                  <th>Xe</th>
                  <th>Chỗ</th>
                  <th>Tài xế</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono font-semibold text-ink-900">{v.plateNumber}</td>
                    <td className="text-ink-600">
                      {v.make} {v.model}
                    </td>
                    <td className="text-ink-600">{v.seats}</td>
                    <td className="text-ink-600">{v.driver?.user?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
