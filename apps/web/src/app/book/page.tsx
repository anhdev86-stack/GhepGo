"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";

export default function BookPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();

  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("10.7769");
  const [pickupLng, setPickupLng] = useState("106.7009");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("10.7907");
  const [dropoffLng, setDropoffLng] = useState("106.6797");
  const [tripType, setTripType] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isLoading && (!user || user.role !== "CUSTOMER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const trip = await api.createTrip(token, {
        pickupAddress,
        pickupLat: parseFloat(pickupLat),
        pickupLng: parseFloat(pickupLng),
        dropoffAddress,
        dropoffLat: parseFloat(dropoffLat),
        dropoffLng: parseFloat(dropoffLng),
        tripType,
        ...(tripType === "SHARED" ? { seatsRequested } : {}),
      });
      setSuccess(trip);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border">
      <h1 className="text-xl font-semibold mb-4">Đặt xe</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="text-sm text-slate-500">Điểm đón</label>
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Địa chỉ đón"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            required
          />
          <div className="flex gap-2 mt-1">
            <input
              className="border rounded px-3 py-2 w-1/2"
              placeholder="Vĩ độ (lat)"
              value={pickupLat}
              onChange={(e) => setPickupLat(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2 w-1/2"
              placeholder="Kinh độ (lng)"
              value={pickupLng}
              onChange={(e) => setPickupLng(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-500">Điểm trả</label>
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Địa chỉ trả"
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
            required
          />
          <div className="flex gap-2 mt-1">
            <input
              className="border rounded px-3 py-2 w-1/2"
              placeholder="Vĩ độ (lat)"
              value={dropoffLat}
              onChange={(e) => setDropoffLat(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2 w-1/2"
              placeholder="Kinh độ (lng)"
              value={dropoffLng}
              onChange={(e) => setDropoffLng(e.target.value)}
            />
          </div>
        </div>

        <select
          className="border rounded px-3 py-2"
          value={tripType}
          onChange={(e) => setTripType(e.target.value as "PRIVATE" | "SHARED")}
        >
          <option value="PRIVATE">Bao xe (riêng)</option>
          <option value="SHARED">Xe ghép</option>
        </select>

        {tripType === "SHARED" && (
          <div>
            <label className="text-sm text-slate-500">Số ghế cần đặt</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={seatsRequested}
              onChange={(e) => setSeatsRequested(Number(e.target.value))}
            >
              <option value={1}>1 ghế</option>
              <option value={2}>2 ghế</option>
              <option value={3}>3 ghế</option>
            </select>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {loading ? "Đang đặt xe..." : "Đặt xe"}
        </button>
      </form>

      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="font-medium">Đặt xe thành công!</p>
          <p className="text-sm text-slate-600">
            Quãng đường: {(success.distanceMeters / 1000).toFixed(1)} km — Giá cước ước tính:{" "}
            {Number(success.fare).toLocaleString("vi-VN")} đ
          </p>
          {success.tripType === "SHARED" && (
            <p className="text-sm text-slate-600 mt-1">
              Đã ghép vào một nhóm xe chung — hệ thống sẽ tìm tài xế phù hợp cho cả nhóm.
            </p>
          )}
          <a href="/trips" className="text-blue-600 text-sm underline">
            Xem trạng thái chuyến đi
          </a>
        </div>
      )}
    </div>
  );
}
