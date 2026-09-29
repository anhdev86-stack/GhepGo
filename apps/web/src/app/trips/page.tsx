"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Đang tìm tài xế",
  ASSIGNED: "Đã phân công",
  ACCEPTED: "Tài xế đã nhận",
  EN_ROUTE_TO_PICKUP: "Tài xế đang tới đón",
  IN_PROGRESS: "Đang di chuyển",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export default function TripsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    const load = () => api.myTrips(token).then(setTrips).catch(() => {});
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [token]);

  if (!isLoading && (!user || user.role !== "CUSTOMER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Chuyến của tôi</h1>
      {trips.length === 0 && <p className="text-slate-500">Chưa có chuyến đi nào.</p>}
      {trips.map((trip) => (
        <div key={trip.id} className="bg-white p-4 rounded-lg border">
          <div className="flex justify-between items-center">
            <span className="font-medium">{STATUS_LABEL[trip.status] ?? trip.status}</span>
            <span className="text-sm text-slate-500">
              {Number(trip.fare).toLocaleString("vi-VN")} đ
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {trip.pickupAddress} → {trip.dropoffAddress}
          </p>
          {trip.tripType === "SHARED" && (
            <p className="text-sm text-blue-600 mt-1">
              Xe ghép
              {trip.group
                ? ` — nhóm ${trip.group.trips?.length ?? trip.group.seatsUsed} khách, điểm dừng ${
                    (trip.group.currentStopIndex ?? 0) + 1
                  }/${trip.group.stops?.length ?? 0}`
                : ""}
            </p>
          )}
          {trip.driver && (
            <p className="text-sm text-slate-500 mt-1">
              Tài xế: {trip.driver.user?.fullName} — {trip.vehicle?.plateNumber}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
