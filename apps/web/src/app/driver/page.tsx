"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";

const NEXT_ACTION: Record<string, { next: string; label: string }> = {
  ACCEPTED: { next: "EN_ROUTE_TO_PICKUP", label: "Bắt đầu tới điểm đón" },
  EN_ROUTE_TO_PICKUP: { next: "IN_PROGRESS", label: "Đã đón khách, bắt đầu chuyến" },
  IN_PROGRESS: { next: "COMPLETED", label: "Hoàn thành chuyến" },
};

export default function DriverPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [myTrips, setMyTrips] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [status, setStatus] = useState<"OFFLINE" | "AVAILABLE">("OFFLINE");
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!token) return;
    api.myVehicles(token).then(setVehicles).catch(() => {});
    api.availableTrips(token).then(setAvailable).catch(() => {});
    api.myDriverTrips(token).then(setMyTrips).catch(() => {});
    api.availableGroups(token).then(setAvailableGroups).catch(() => {});
    api.myGroups(token).then(setMyGroups).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const onAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await api.registerVehicle(token, { plateNumber, make, model });
      setPlateNumber("");
      setMake("");
      setModel("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const toggleStatus = async () => {
    if (!token) return;
    const nextStatus = status === "AVAILABLE" ? "OFFLINE" : "AVAILABLE";
    try {
      await api.updateDriverStatus(token, nextStatus);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const acceptTrip = async (tripId: string) => {
    if (!token) return;
    try {
      await api.acceptTrip(token, tripId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const advanceTrip = async (tripId: string, nextStatus: string) => {
    if (!token) return;
    try {
      await api.updateTripStatus(token, tripId, nextStatus);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const activeTrips = myTrips.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Bảng điều khiển tài xế</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="bg-white p-4 rounded-lg border">
        <div className="flex justify-between items-center">
          <span>Trạng thái: {status === "AVAILABLE" ? "Đang trực" : "Ngoại tuyến"}</span>
          <button
            onClick={toggleStatus}
            className={`px-3 py-1.5 rounded text-white ${
              status === "AVAILABLE" ? "bg-slate-500" : "bg-green-600"
            }`}
          >
            {status === "AVAILABLE" ? "Ngừng trực" : "Bắt đầu trực"}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Xe của tôi</h2>
        <ul className="text-sm mb-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              {v.plateNumber} — {v.make} {v.model}
            </li>
          ))}
          {vehicles.length === 0 && <li className="text-slate-500">Chưa có xe nào</li>}
        </ul>
        <form onSubmit={onAddVehicle} className="flex gap-2 flex-wrap">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Biển số"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            required
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Hãng xe"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            required
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Dòng xe"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
          <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm">Thêm xe</button>
        </form>
      </div>

      {activeTrips.length > 0 && (
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="font-medium mb-2">Chuyến đang thực hiện</h2>
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
                  onClick={() => advanceTrip(trip.id, NEXT_ACTION[trip.status].next)}
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
        <h2 className="font-medium mb-2">Chuyến khả dụng</h2>
        {available.length === 0 && (
          <p className="text-slate-500 text-sm">Không có chuyến nào đang chờ</p>
        )}
        {available.map((trip) => (
          <div key={trip.id} className="border rounded p-3 mb-2">
            <p className="text-sm">
              {trip.pickupAddress} → {trip.dropoffAddress}
            </p>
            <p className="text-sm text-slate-500">
              {(trip.distanceMeters / 1000).toFixed(1)} km —{" "}
              {Number(trip.fare).toLocaleString("vi-VN")} đ
            </p>
            <button
              onClick={() => acceptTrip(trip.id)}
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
