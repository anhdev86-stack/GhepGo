"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { mapsLink, useNow, useRealtime, useSocketEvent, WS, type DriverLocation } from "@/lib/realtime";

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Đang tìm tài xế",
  ASSIGNED: "Đã ghép nhóm, đang tìm tài xế",
  ACCEPTED: "Tài xế đã nhận",
  EN_ROUTE_TO_PICKUP: "Tài xế đang tới đón",
  IN_PROGRESS: "Đang di chuyển",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

const ACTIVE = ["REQUESTED", "ASSIGNED", "ACCEPTED", "EN_ROUTE_TO_PICKUP", "IN_PROGRESS"];
const CANCELLABLE = ["REQUESTED", "ASSIGNED", "ACCEPTED", "EN_ROUTE_TO_PICKUP"];

export default function TripsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const { socket, connected } = useRealtime(token);
  const now = useNow();
  const [trips, setTrips] = useState<any[]>([]);
  const [locations, setLocations] = useState<Record<string, DriverLocation>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.myTrips(token).then(setTrips).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  // Join the room of every active trip so we receive its driver's GPS.
  useEffect(() => {
    if (!socket) return;
    for (const t of trips) {
      if (ACTIVE.includes(t.status)) socket.emit(WS.SUBSCRIBE_TRIP, { tripId: t.id });
    }
  }, [socket, trips]);

  useSocketEvent(socket, WS.TRIP_UPDATED, load);
  useSocketEvent(socket, WS.GROUP_UPDATED, load);
  useSocketEvent<DriverLocation>(socket, WS.DRIVER_LOCATION, (loc) =>
    setLocations((prev) => ({ ...prev, [loc.driverId]: loc })),
  );

  if (!isLoading && (!user || user.role !== "CUSTOMER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const rate = async (tripId: string, score: number) => {
    if (!token) return;
    const comment = prompt("Nhận xét (không bắt buộc)") ?? undefined;
    setError(null);
    try {
      await api.rateTrip(token, tripId, { score, comment: comment || undefined });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const cancel = async (tripId: string) => {
    if (!token) return;
    if (!confirm("Huỷ chuyến đi này?")) return;
    setError(null);
    try {
      await api.cancelTrip(token, tripId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chuyến của tôi</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
          {connected ? "Cập nhật trực tiếp" : "Mất kết nối realtime"}
        </span>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {trips.length === 0 && <p className="text-slate-500">Chưa có chuyến đi nào.</p>}
      {trips.map((trip) => {
        const loc = trip.driverId ? locations[trip.driverId] : undefined;
        const group = trip.group;
        const myStops = group?.stops?.filter((s: any) => s.tripId === trip.id) ?? [];
        const stopsAhead = myStops.length
          ? Math.max(0, myStops[0].sequence - (group.currentStopIndex ?? 0))
          : null;
        return (
          <div key={trip.id} className="bg-white p-4 rounded-lg border">
            <div className="flex justify-between items-center">
              <span className="font-medium">{STATUS_LABEL[trip.status] ?? trip.status}</span>
              <span className="text-sm text-slate-500">{Number(trip.fare).toLocaleString("vi-VN")} đ</span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {trip.pickupAddress} → {trip.dropoffAddress}
            </p>

            {trip.tripType === "SHARED" && group && (
              <div className="text-sm text-blue-700 mt-2 bg-blue-50 rounded p-2">
                <p>
                  Xe ghép · {group.trips?.length ?? group.seatsUsed} khách · điểm dừng {(group.currentStopIndex ?? 0) + 1}/
                  {group.stops?.length ?? 0}
                  {stopsAhead !== null && ACTIVE.includes(trip.status) && trip.status !== "IN_PROGRESS" && (
                    <> · còn {stopsAhead} điểm trước khi đón bạn</>
                  )}
                </p>
                <ol className="mt-1 text-xs text-slate-600 space-y-0.5">
                  {group.stops?.map((s: any, i: number) => (
                    <li key={s.id} className={i < group.currentStopIndex ? "line-through text-slate-400" : s.tripId === trip.id ? "font-medium text-slate-900" : ""}>
                      {i + 1}. {s.kind === "PICKUP" ? "Đón" : "Trả"} · {s.address}
                      {s.tripId === trip.id ? " (bạn)" : ""}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {trip.driver && (
              <p className="text-sm text-slate-500 mt-2">
                Tài xế: {trip.driver.user?.fullName} — {trip.vehicle?.plateNumber}
              </p>
            )}
            {loc && ACTIVE.includes(trip.status) && (
              <p className="text-sm text-green-700 mt-1">
                Vị trí tài xế: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{" "}
                <a className="underline" href={mapsLink(loc.lat, loc.lng)} target="_blank" rel="noreferrer">
                  mở bản đồ
                </a>{" "}
                <span className="text-slate-400">({Math.max(0, Math.round((now - loc.updatedAt) / 1000))}s trước)</span>
              </p>
            )}

            {trip.status === "COMPLETED" && trip.payment && (
              <p className="text-xs text-slate-500 mt-2">
                Thanh toán: {trip.payment.method === "WALLET" ? "ví" : "tiền mặt"} ·{" "}
                {trip.payment.status === "PAID" ? "đã thanh toán" : "chờ tài xế xác nhận"}
              </p>
            )}
            {trip.status === "COMPLETED" && !trip.rating && (
              <div className="mt-2 flex items-center gap-1 text-sm">
                <span className="text-slate-500 mr-1">Đánh giá tài xế:</span>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => rate(trip.id, s)} className="text-xl text-yellow-500 hover:scale-110" title={`${s} sao`}>
                    ★
                  </button>
                ))}
              </div>
            )}
            {trip.rating && <p className="text-xs text-slate-500 mt-2">Bạn đã đánh giá {trip.rating.score} ★</p>}
            {["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(trip.status) && (
              <p className="text-xs mt-2">
                {trip.complaints?.some((c: any) => ["OPEN", "IN_REVIEW"].includes(c.status)) ? (
                  <a href={`/complaints?id=${trip.complaints[0].id}`} className="text-orange-600 underline">Khiếu nại đang xử lý</a>
                ) : (
                  <a href={`/complaints?tripId=${trip.id}`} className="text-slate-500 underline">Báo cáo sự cố / khiếu nại</a>
                )}
              </p>
            )}

            {CANCELLABLE.includes(trip.status) && (
              <button onClick={() => cancel(trip.id)} className="mt-3 text-sm text-red-600 underline">
                Huỷ chuyến
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
