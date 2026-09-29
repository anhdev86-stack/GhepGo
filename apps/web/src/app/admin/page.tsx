"use client";

import { useCallback, useEffect, useState } from "react";
import { mapsLink, useRealtime, useSocketEvent, WS, type DriverLocation } from "@/lib/realtime";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

export default function AdminPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [locations, setLocations] = useState<Record<string, DriverLocation>>({});
  const { socket, connected } = useRealtime(token);

  const load = useCallback(() => {
    if (!token) return;
    api.allDrivers(token).then(setDrivers).catch(() => {});
    api.allVehicles(token).then(setVehicles).catch(() => {});
    api.allTrips(token).then(setTrips).catch(() => {});
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quản trị đội xe</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
          {connected ? "Realtime: kết nối" : "Realtime: mất kết nối"}
        </span>
      </div>

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
