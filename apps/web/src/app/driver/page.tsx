"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { useDriverLocationStream, useRealtime, useSocketEvent, WS } from "@/lib/realtime";

const NEXT_ACTION: Record<string, { next: string; label: string }> = {
  ACCEPTED: { next: "EN_ROUTE_TO_PICKUP", label: "Bắt đầu tới điểm đón" },
  EN_ROUTE_TO_PICKUP: { next: "IN_PROGRESS", label: "Đã đón khách, bắt đầu chuyến" },
  IN_PROGRESS: { next: "COMPLETED", label: "Hoàn thành chuyến" },
};

function StopList({ stops, currentStopIndex }: { stops: any[]; currentStopIndex: number }) {
  return (
    <ol className="text-sm mt-2 space-y-1">
      {stops.map((s, i) => {
        const done = i < currentStopIndex;
        const current = i === currentStopIndex;
        return (
          <li
            key={s.id}
            className={`flex gap-2 ${done ? "text-slate-400 line-through" : current ? "font-medium text-blue-700" : ""}`}
          >
            <span className="w-5 text-right">{i + 1}.</span>
            <span className={`px-1 rounded text-xs self-center ${s.kind === "PICKUP" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
              {s.kind === "PICKUP" ? "Đón" : "Trả"}
            </span>
            <span>{s.address}</span>
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
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { lastFix, geoError } = useDriverLocationStream(socket, status !== "OFFLINE");

  const refresh = useCallback(() => {
    if (!token) return;
    api.myVehicles(token).then(setVehicles).catch(() => {});
    api.availableTrips(token).then(setAvailable).catch(() => {});
    api.myDriverTrips(token).then(setMyTrips).catch(() => {});
    api.availableGroups(token).then(setAvailableGroups).catch(() => {});
    api.myGroups(token).then(setMyGroups).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.driverMe(token).then((d) => setStatus(d.status)).catch(() => {});
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
    });
  };

  const toggleStatus = () =>
    run(async () => {
      const nextStatus = status === "OFFLINE" ? "AVAILABLE" : "OFFLINE";
      await api.updateDriverStatus(token!, nextStatus);
      setStatus(nextStatus);
    });

  const activeTrips = myTrips.filter(
    (t) => t.tripType === "PRIVATE" && !["COMPLETED", "CANCELLED"].includes(t.status),
  );
  const cashToConfirm = myTrips.filter(
    (t) => t.status === "COMPLETED" && t.payment?.method === "CASH" && t.payment?.status === "PENDING",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bảng điều khiển tài xế</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
          {connected ? "Realtime: kết nối" : "Realtime: mất kết nối"}
        </span>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="bg-white p-4 rounded-lg border">
        <div className="flex justify-between items-center">
          <div>
            <p>
              Trạng thái:{" "}
              {status === "AVAILABLE" ? "Đang trực" : status === "ON_TRIP" ? "Đang chạy chuyến" : "Ngoại tuyến"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {status === "OFFLINE"
                ? "Bật trực để bắt đầu gửi vị trí GPS"
                : lastFix
                  ? `GPS: ${lastFix.lat.toFixed(5)}, ${lastFix.lng.toFixed(5)}`
                  : geoError
                    ? `GPS lỗi: ${geoError}`
                    : "Đang lấy vị trí GPS..."}
            </p>
          </div>
          <button
            onClick={toggleStatus}
            disabled={status === "ON_TRIP"}
            className={`px-3 py-1.5 rounded text-white disabled:opacity-50 ${status === "OFFLINE" ? "bg-green-600" : "bg-slate-500"}`}
          >
            {status === "OFFLINE" ? "Bắt đầu trực" : "Ngừng trực"}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Xe của tôi</h2>
        <ul className="text-sm mb-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              {v.plateNumber} — {v.make} {v.model} ({v.seats} chỗ)
            </li>
          ))}
          {vehicles.length === 0 && <li className="text-slate-500">Chưa có xe nào</li>}
        </ul>
        <form onSubmit={onAddVehicle} className="flex gap-2 flex-wrap">
          <input className="border rounded px-2 py-1 text-sm" placeholder="Biển số" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Hãng xe" value={make} onChange={(e) => setMake(e.target.value)} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Dòng xe" value={model} onChange={(e) => setModel(e.target.value)} required />
          <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm">Thêm xe</button>
        </form>
      </div>

      {cashToConfirm.length > 0 && (
        <div className="bg-white p-4 rounded-lg border border-orange-200">
          <h2 className="font-medium mb-2">Xác nhận đã thu tiền mặt</h2>
          {cashToConfirm.map((t) => (
            <div key={t.id} className="flex justify-between items-center text-sm py-1 border-t first:border-t-0">
              <span>
                {t.customer?.fullName ?? "Khách"} · {t.pickupAddress} → {t.dropoffAddress}
              </span>
              <button onClick={() => run(() => api.confirmCash(token!, t.id))} className="bg-orange-500 text-white rounded px-2 py-1 text-xs">
                Đã thu {Number(t.fare).toLocaleString("vi-VN")} đ
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-500 mt-2">
            Phí nền tảng của chuyến tiền mặt được trừ vào ví; xem chi tiết tại <a href="/wallet" className="underline">Thu nhập</a>.
          </p>
        </div>
      )}

      {myGroups.length > 0 && (
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="font-medium mb-2">Chuyến ghép đang thực hiện</h2>
          {myGroups.map((g) => {
            const nextStop = g.stops[g.currentStopIndex];
            return (
              <div key={g.id} className="border rounded p-3 mb-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {g.trips.length} khách · {g.seatsUsed} ghế · {((g.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km
                  </span>
                  <span className="text-slate-500">{g.status}</span>
                </div>
                <StopList stops={g.stops} currentStopIndex={g.currentStopIndex} />
                {nextStop && (
                  <button
                    onClick={() => run(() => api.advanceGroup(token!, g.id))}
                    className="mt-3 bg-green-600 text-white rounded px-3 py-1 text-sm"
                  >
                    {nextStop.kind === "PICKUP" ? "Đã đón" : "Đã trả"} khách tại điểm {g.currentStopIndex + 1}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTrips.length > 0 && (
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="font-medium mb-2">Chuyến bao xe đang thực hiện</h2>
          {activeTrips.map((trip) => (
            <div key={trip.id} className="border rounded p-3 mb-2">
              <p className="text-sm">
                {trip.pickupAddress} → {trip.dropoffAddress}
              </p>
              <p className="text-sm text-slate-500">
                {Number(trip.fare).toLocaleString("vi-VN")} đ — {trip.status}
              </p>
              {NEXT_ACTION[trip.status] && (
                <button
                  onClick={() => run(() => api.updateTripStatus(token!, trip.id, NEXT_ACTION[trip.status].next))}
                  className="mt-2 bg-green-600 text-white rounded px-3 py-1 text-sm"
                >
                  {NEXT_ACTION[trip.status].label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Nhóm xe ghép chờ tài xế</h2>
        {availableGroups.length === 0 && <p className="text-slate-500 text-sm">Không có nhóm nào đang chờ</p>}
        {availableGroups.map((g) => (
          <div key={g.id} className="border rounded p-3 mb-2">
            <p className="text-sm">
              {g.trips.length} khách · {g.seatsUsed} ghế · {((g.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km ·{" "}
              {g.trips.reduce((sum: number, t: any) => sum + Number(t.fare), 0).toLocaleString("vi-VN")} đ
            </p>
            <StopList stops={g.stops} currentStopIndex={0} />
            <button
              onClick={() => run(() => api.acceptGroup(token!, g.id))}
              className="mt-2 bg-blue-600 text-white rounded px-3 py-1 text-sm"
            >
              Nhận nhóm chuyến
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Chuyến bao xe khả dụng</h2>
        {available.length === 0 && <p className="text-slate-500 text-sm">Không có chuyến nào đang chờ</p>}
        {available.map((trip) => (
          <div key={trip.id} className="border rounded p-3 mb-2">
            <p className="text-sm">
              {trip.pickupAddress} → {trip.dropoffAddress}
            </p>
            <p className="text-sm text-slate-500">
              {(trip.distanceMeters / 1000).toFixed(1)} km — {Number(trip.fare).toLocaleString("vi-VN")} đ
            </p>
            <button
              onClick={() => run(() => api.acceptTrip(token!, trip.id))}
              className="mt-2 bg-blue-600 text-white rounded px-3 py-1 text-sm"
            >
              Nhận chuyến
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
