"use client";

import { useCallback, useEffect, useState } from "react";
import { mapsLink, useRealtime, useSocketEvent, WS, type DriverLocation } from "@/lib/realtime";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { MapView, type MapCircle, type MapMarker, type MapPolygon } from "@/components/map-view";
import { useMapTiles } from "@/lib/map";

const ACTIVE_TRIP = ["REQUESTED", "ASSIGNED", "ACCEPTED", "EN_ROUTE_TO_PICKUP", "IN_PROGRESS"];
const DRIVER_COLOR: Record<string, string> = { AVAILABLE: "Đang trực", ON_TRIP: "Đang chạy", OFFLINE: "Ngoại tuyến" };

export default function AdminPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [locations, setLocations] = useState<Record<string, DriverLocation>>({});
  const [zones, setZones] = useState<any[]>([]);
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
  useSocketEvent<DriverLocation>(socket, WS.DRIVER_LOCATION, (loc) =>
    setLocations((prev) => ({ ...prev, [loc.driverId]: loc })),
  );

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
      title: `${d.user?.fullName} · ${DRIVER_COLOR[d.status] ?? d.status}${d.zone?.name ? ` · ${d.zone.name}` : ""}${live ? "" : " · vị trí cũ"}`,
    });
  }
  for (const t of trips) {
    if (!ACTIVE_TRIP.includes(t.status)) continue;
    markers.push({ id: `t-${t.id}`, kind: t.status === "REQUESTED" ? "trip" : "pickup", lat: t.pickupLat, lng: t.pickupLng, label: t.tripType === "SHARED" ? "G" : "!", title: `${t.customer?.fullName} · ${t.status} · ${t.pickupAddress}` });
  }
  const polygons: MapPolygon[] = [];
  const circles: MapCircle[] = [];
  for (const z of zones) {
    if (!z.isActive) continue;
    const ring = z.polygon?.coordinates?.[0];
    if (ring) polygons.push({ id: z.id, ring: ring.map(([lng, lat]: [number, number]) => ({ lat, lng })), title: z.name, color: "#0891b2" });
    else circles.push({ id: z.id, center: { lat: z.centerLat, lng: z.centerLng }, radiusMeters: z.radiusKm * 1000, title: z.name, color: "#0891b2" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quản trị đội xe</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
          {connected ? "Realtime: kết nối" : "Realtime: mất kết nối"}
        </span>
      </div>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Bản đồ đội xe</h2>
        <MapView tiles={tiles} markers={markers} polygons={polygons} circles={circles} fitKey={`${zones.length}:${drivers.length}`} height={420} />
        <p className="text-xs text-slate-500 mt-1">
          Mũi tên xanh: tài xế đang trực/đang chạy (vị trí GPS trực tiếp, cập nhật realtime) · &quot;!&quot; chuyến bao xe đang chờ · &quot;G&quot; nhóm ghép · A: điểm đón chuyến đã có tài xế · vùng xanh lam: khu vực hoạt động.
        </p>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Tài xế ({drivers.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Tên</th>
              <th>SĐT</th>
              <th>Trạng thái</th>
              <th>Số xe</th>
              <th>Vị trí</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const live = locations[d.id];
              const lat = live?.lat ?? d.currentLat;
              const lng = live?.lng ?? d.currentLng;
              return (
                <tr key={d.id} className="border-t">
                  <td>{d.user?.fullName}</td>
                  <td>{d.user?.phone}</td>
                  <td>{d.status}</td>
                  <td>{d.vehicles?.length ?? 0}</td>
                  <td className="text-xs">
                    {lat != null && lng != null ? (
                      <a className="text-blue-600 underline" href={mapsLink(lat, lng)} target="_blank" rel="noreferrer">
                        {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                        {live ? " ●" : ""}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Xe ({vehicles.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Biển số</th>
              <th>Xe</th>
              <th>Tài xế</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-t">
                <td>{v.plateNumber}</td>
                <td>
                  {v.make} {v.model}
                </td>
                <td>{v.driver?.user?.fullName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Chuyến đi ({trips.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Khách</th>
              <th>Loại</th>
              <th>Tài xế</th>
              <th>Trạng thái</th>
              <th>Giá</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="border-t">
                <td>{t.customer?.fullName}</td>
                <td>{t.tripType === "SHARED" ? `Ghép (${t.group?.trips?.length ?? "?"} khách)` : "Bao xe"}</td>
                <td>{t.driver?.user?.fullName ?? "-"}</td>
                <td>{t.status}</td>
                <td>{Number(t.fare).toLocaleString("vi-VN")} đ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
