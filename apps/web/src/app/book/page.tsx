"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { AddressInput, type Place } from "@/components/address-input";

const BASE_FARE = 15000;
const PER_KM = 11000;

export default function BookPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();

  const [pickup, setPickup] = useState<Place>({ address: "", lat: 10.7769, lng: 106.7009 });
  const [dropoff, setDropoff] = useState<Place>({ address: "", lat: 10.7907, lng: 106.6797 });
  const [tripType, setTripType] = useState<"PRIVATE" | "SHARED">("PRIVATE");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "WALLET">("CASH");
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [nearby, setNearby] = useState<any[] | null>(null);
  const [wallet, setWallet] = useState<any | null>(null);
  const [preview, setPreview] = useState<{ distanceMeters: number; durationSecs: number; estimated: boolean } | null>(null);
  const [coverage, setCoverage] = useState<{ served: boolean; zone: { name: string } | null; zonesConfigured: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    api.wallet(token).then(setWallet).catch(() => {});
  }, [token]);

  // Live drivers around the pickup (Redis GEO) + road route preview.
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      api.nearbyDrivers(token, pickup.lat, pickup.lng, 5000).then(setNearby).catch(() => setNearby(null));
      api.zoneCoverage(token, pickup.lat, pickup.lng).then(setCoverage).catch(() => setCoverage(null));
      api.route(token, pickup, dropoff).then(setPreview).catch(() => setPreview(null));
    }, 500);
    return () => clearTimeout(t);
  }, [token, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoading && (!user || user.role !== "CUSTOMER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const estFare = preview ? Math.round(BASE_FARE + (preview.distanceMeters / 1000) * PER_KM) : null;
  const shownFare = estFare && tripType === "SHARED" ? Math.round(estFare * 0.75) : estFare;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const trip = await api.createTrip(token, {
        pickupAddress: pickup.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffAddress: dropoff.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        tripType,
        paymentMethod,
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
        <AddressInput token={token} label="Điểm đón" value={pickup} onChange={setPickup} near={pickup} />
        <AddressInput token={token} label="Điểm trả" value={dropoff} onChange={setDropoff} near={pickup} />

        {preview && (
          <p className="text-sm text-slate-600 bg-slate-50 rounded p-2">
            Quãng đường {(preview.distanceMeters / 1000).toFixed(1)} km · khoảng {Math.round(preview.durationSecs / 60)} phút ·
            giá dự kiến <b>{shownFare?.toLocaleString("vi-VN")} đ</b>
            {tripType === "SHARED" && " (đã giảm 25% xe ghép, cộng phụ phí nếu đi vòng)"}
            {preview.estimated && <span className="text-orange-600"> · ước lượng đường chim bay</span>}
          </p>
        )}
        {coverage && coverage.zonesConfigured > 0 && (
          <p className={`text-xs ${coverage.served ? "text-slate-500" : "text-red-600"}`}>
            {coverage.served ? `Khu vực phục vụ: ${coverage.zone?.name ?? "toàn hệ thống"}` : "Điểm đón nằm ngoài vùng phục vụ hiện tại, chưa thể đặt xe."}
          </p>
        )}
        {nearby !== null && (
          <p className="text-xs text-slate-500">
            {nearby.length > 0
              ? `${nearby.length} tài xế đang trực trong 5 km (gần nhất ${(nearby[0].distanceMeters / 1000).toFixed(1)} km)`
              : "Chưa có tài xế nào đang trực gần điểm đón"}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <select className="border rounded px-3 py-2" value={tripType} onChange={(e) => setTripType(e.target.value as "PRIVATE" | "SHARED")}>
            <option value="PRIVATE">Bao xe (riêng)</option>
            <option value="SHARED">Xe ghép (-25%)</option>
          </select>
          <select className="border rounded px-3 py-2" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "WALLET")}>
            <option value="CASH">Tiền mặt</option>
            <option value="WALLET">Ví GhepGo{wallet ? ` (${Number(wallet.balance).toLocaleString("vi-VN")} đ)` : ""}</option>
          </select>
        </div>
        {paymentMethod === "WALLET" && wallet && shownFare && Number(wallet.balance) < shownFare && (
          <p className="text-xs text-orange-600">
            Số dư ví có thể không đủ; nếu thiếu khi kết thúc chuyến, hệ thống sẽ chuyển sang thanh toán tiền mặt.{" "}
            <a href="/wallet" className="underline">Nạp ví</a>
          </p>
        )}

        {tripType === "SHARED" && (
          <div>
            <label className="text-sm text-slate-500">Số ghế cần đặt</label>
            <select className="border rounded px-3 py-2 w-full" value={seatsRequested} onChange={(e) => setSeatsRequested(Number(e.target.value))}>
              <option value={1}>1 ghế</option>
              <option value={2}>2 ghế</option>
              <option value={3}>3 ghế</option>
            </select>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading || (coverage ? !coverage.served : false)} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
          {loading ? "Đang đặt xe..." : "Đặt xe"}
        </button>
      </form>

      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="font-medium">Đặt xe thành công!</p>
          <p className="text-sm text-slate-600">
            Quãng đường: {(success.distanceMeters / 1000).toFixed(1)} km — Giá cước: {Number(success.fare).toLocaleString("vi-VN")} đ —{" "}
            {success.paymentMethod === "WALLET" ? "trừ ví khi hoàn thành" : "trả tiền mặt cho tài xế"}
          </p>
          {success.tripType === "SHARED" && (
            <p className="text-sm text-slate-600 mt-1">
              {success.driverId
                ? "Đã ghép vào một xe đang chạy cùng hướng — tài xế sẽ ghé đón bạn."
                : "Đã ghép vào một nhóm xe chung — hệ thống sẽ tìm tài xế phù hợp cho cả nhóm."}
            </p>
          )}
          <a href="/trips" className="text-blue-600 text-sm underline">Xem trạng thái chuyến đi</a>
        </div>
      )}
    </div>
  );
}
