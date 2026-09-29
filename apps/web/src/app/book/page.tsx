"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError, type RouteResult } from "@/lib/api";
import { AddressInput, type Place } from "@/components/address-input";
import { MapView, type MapMarker, type MapPolygon, type MapCircle } from "@/components/map-view";
import { coordLabel, routePath, useMapTiles, type LatLng } from "@/lib/map";
import { Alert, Button, Card, Field, Icon, LinkButton, Segmented, Select } from "@/components/ui";

const BASE_FARE = 15000;
const PER_KM = 11000;
const vnd = (n: number) => n.toLocaleString("vi-VN") + " đ";

type PickTarget = "pickup" | "dropoff" | null;

export default function BookPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const tiles = useMapTiles(token);

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
  const [preview, setPreview] = useState<RouteResult | null>(null);
  const [coverage, setCoverage] = useState<{ served: boolean; zone: { name: string } | null; zonesConfigured: number } | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [picking, setPicking] = useState<PickTarget>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.wallet(token).then(setWallet).catch(() => {});
    api.publicZones(token).then(setZones).catch(() => setZones([]));
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

  /** Map tap / marker drag → coordinates now, address from reverse geocoding when it answers. */
  const placeFromMap = useCallback(
    async (target: "pickup" | "dropoff", p: LatLng) => {
      const set = target === "pickup" ? setPickup : setDropoff;
      set({ address: coordLabel(p), lat: p.lat, lng: p.lng });
      if (!token) return;
      setResolving(true);
      try {
        const { place } = await api.reverseGeocode(token, p);
        if (place) set({ address: place.address, lat: p.lat, lng: p.lng });
      } catch {
        // keep the coordinate label
      } finally {
        setResolving(false);
      }
    },
    [token],
  );

  const onMapClick = useCallback(
    (p: LatLng) => {
      if (!picking) return;
      placeFromMap(picking, p);
      // First tap sets the pickup, the next one the dropoff — a natural two-tap booking.
      setPicking(picking === "pickup" ? "dropoff" : null);
    },
    [picking, placeFromMap],
  );

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [
      { id: "pickup", kind: "pickup", lat: pickup.lat, lng: pickup.lng, title: `Điểm đón: ${pickup.address || coordLabel(pickup)}`, draggable: true, onDragEnd: (p) => placeFromMap("pickup", p) },
      { id: "dropoff", kind: "dropoff", lat: dropoff.lat, lng: dropoff.lng, title: `Điểm trả: ${dropoff.address || coordLabel(dropoff)}`, draggable: true, onDragEnd: (p) => placeFromMap("dropoff", p) },
    ];
    for (const d of nearby ?? []) {
      m.push({ id: `drv-${d.driverId}`, kind: "driver", lat: d.lat, lng: d.lng, title: `${d.fullName}${d.vehicle ? ` · ${d.vehicle.plateNumber}` : ""} · ${(d.distanceMeters / 1000).toFixed(1)} km` });
    }
    return m;
  }, [pickup, dropoff, nearby, placeFromMap]);

  const route = useMemo(() => routePath(preview?.polyline, [pickup, dropoff]), [preview?.polyline, pickup, dropoff]);
  const polylines = useMemo(() => [{ id: "route", points: route.points, dashed: route.straight }], [route]);
  const { polygons, circles } = useMemo(() => {
    const polygons: MapPolygon[] = [];
    const circles: MapCircle[] = [];
    for (const z of zones) {
      const ring = z.polygon?.coordinates?.[0];
      if (ring) polygons.push({ id: z.id, ring: ring.map(([lng, lat]: [number, number]) => ({ lat, lng })), title: `Khu vực ${z.name}`, color: "#0891b2" });
      else circles.push({ id: z.id, center: { lat: z.centerLat, lng: z.centerLng }, radiusMeters: z.radiusKm * 1000, title: `Khu vực ${z.name}`, color: "#0891b2" });
    }
    return { polygons, circles };
  }, [zones]);

  if (!isLoading && (!user || user.role !== "CUSTOMER")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const estFare = preview ? Math.round(BASE_FARE + (preview.distanceMeters / 1000) * PER_KM) : null;
  const shownFare = estFare && tripType === "SHARED" ? Math.round(estFare * 0.75) : estFare;
  const outOfArea = coverage ? !coverage.served : false;

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

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Icon.check className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ink-900">Đặt xe thành công</h1>
          <p className="mt-1 text-ink-500">
            {success.tripType === "SHARED"
              ? success.driverId
                ? "Bạn đã được ghép vào một xe đang chạy cùng hướng. Tài xế sẽ ghé đón bạn."
                : "Bạn đã vào một nhóm xe ghép. Hệ thống đang tìm tài xế phù hợp cho cả nhóm."
              : "Hệ thống đang gửi yêu cầu tới các tài xế gần bạn."}
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-ink-50 p-3">
              <dt className="text-xs text-ink-500">Quãng đường</dt>
              <dd className="font-semibold text-ink-900">{(success.distanceMeters / 1000).toFixed(1)} km</dd>
            </div>
            <div className="rounded-xl bg-ink-50 p-3">
              <dt className="text-xs text-ink-500">Giá cước</dt>
              <dd className="font-semibold text-brand-700">{vnd(Number(success.fare))}</dd>
            </div>
            <div className="rounded-xl bg-ink-50 p-3">
              <dt className="text-xs text-ink-500">Thanh toán</dt>
              <dd className="font-semibold text-ink-900">{success.paymentMethod === "WALLET" ? "Ví" : "Tiền mặt"}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <LinkButton href="/trips" size="lg">
              Theo dõi chuyến đi
              <Icon.arrowRight className="h-5 w-5" />
            </LinkButton>
            <Button variant="secondary" size="lg" onClick={() => setSuccess(null)}>
              Đặt chuyến khác
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-ink-900">Bạn muốn đi đâu?</h1>
        <p className="text-ink-500 mt-1">Nhập địa chỉ hoặc chạm trên bản đồ. Giá hiện trước khi bạn đặt.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
        <form onSubmit={onSubmit} className="card p-5 sm:p-6 flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="relative flex flex-col gap-4">
            <span className="absolute left-[19px] top-[42px] bottom-[42px] w-px border-l-2 border-dashed border-ink-200" aria-hidden />
            <AddressInput token={token} label="Điểm đón" value={pickup} onChange={setPickup} near={pickup} tone="pickup" />
            <AddressInput token={token} label="Điểm trả" value={dropoff} onChange={setDropoff} near={pickup} tone="dropoff" />
          </div>

          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPicking(picking === "pickup" ? null : "pickup")}
              className={`btn btn-sm flex-1 ${picking === "pickup" ? "bg-emerald-600 text-white" : "btn-secondary"}`}
            >
              <Icon.pin className="h-4 w-4" />
              {picking === "pickup" ? "Chạm bản đồ…" : "Chọn điểm đón"}
            </button>
            <button
              type="button"
              onClick={() => setPicking(picking === "dropoff" ? null : "dropoff")}
              className={`btn btn-sm flex-1 ${picking === "dropoff" ? "bg-orange-600 text-white" : "btn-secondary"}`}
            >
              <Icon.pin className="h-4 w-4" />
              {picking === "dropoff" ? "Chạm bản đồ…" : "Chọn điểm trả"}
            </button>
          </div>

          <Field label="Loại chuyến">
            <Segmented
              value={tripType}
              onChange={setTripType}
              options={[
                { value: "PRIVATE", label: "Bao xe", hint: "Đi riêng, nhanh nhất" },
                { value: "SHARED", label: "Xe ghép", hint: "Rẻ hơn 25%" },
              ]}
            />
          </Field>

          {tripType === "SHARED" && (
            <Field label="Số ghế">
              <Select value={seatsRequested} onChange={(e) => setSeatsRequested(Number(e.target.value))}>
                <option value={1}>1 ghế</option>
                <option value={2}>2 ghế</option>
                <option value={3}>3 ghế</option>
              </Select>
            </Field>
          )}

          <Field label="Thanh toán">
            <Segmented
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={[
                { value: "CASH", label: "Tiền mặt", hint: "Trả tài xế" },
                { value: "WALLET", label: "Ví GhepGo", hint: wallet ? `Số dư ${vnd(Number(wallet.balance))}` : "Trừ khi hoàn thành" },
              ]}
            />
          </Field>
          {paymentMethod === "WALLET" && wallet && shownFare && Number(wallet.balance) < shownFare && (
            <Alert tone="amber">
              Số dư ví có thể không đủ; nếu thiếu khi kết thúc chuyến, hệ thống chuyển sang tiền mặt.{" "}
              <a href="/wallet" className="underline font-medium">Nạp ví</a>
            </Alert>
          )}

          {/* Price summary */}
          <div className="rounded-2xl bg-ink-900 text-white p-4">
            {preview ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/60">Giá dự kiến</p>
                    <p className="text-3xl font-bold leading-tight">{shownFare != null ? vnd(shownFare) : "…"}</p>
                    {tripType === "SHARED" && estFare && <p className="text-xs text-white/50 line-through">{vnd(estFare)} bao xe</p>}
                  </div>
                  <div className="text-right text-sm text-white/80">
                    <p className="flex items-center justify-end gap-1.5">
                      <Icon.route className="h-4 w-4" />
                      {(preview.distanceMeters / 1000).toFixed(1)} km
                    </p>
                    <p className="flex items-center justify-end gap-1.5 mt-1">
                      <Icon.clock className="h-4 w-4" />~{Math.round(preview.durationSecs / 60)} phút
                    </p>
                  </div>
                </div>
                {preview.estimated && <p className="mt-2 text-[11px] text-amber-300">Ước lượng theo đường chim bay, dịch vụ bản đồ chưa phản hồi.</p>}
                {tripType === "SHARED" && <p className="mt-2 text-[11px] text-white/60">Đã giảm 25%; cộng phụ phí nhỏ nếu xe phải đi vòng vì bạn.</p>}
              </>
            ) : (
              <p className="text-sm text-white/70">Đang tính giá…</p>
            )}
          </div>

          <div className="text-xs text-ink-500 space-y-1">
            {coverage && coverage.zonesConfigured > 0 && (
              <p className={outOfArea ? "text-red-600 font-medium" : ""}>
                {coverage.served ? `Khu vực phục vụ: ${coverage.zone?.name ?? "toàn hệ thống"}` : "Điểm đón nằm ngoài vùng phục vụ hiện tại."}
              </p>
            )}
            {nearby !== null && (
              <p className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${nearby.length ? "bg-emerald-500" : "bg-ink-300"}`} />
                {nearby.length > 0
                  ? `${nearby.length} tài xế đang trực trong 5 km · gần nhất ${(nearby[0].distanceMeters / 1000).toFixed(1)} km`
                  : "Chưa có tài xế nào đang trực gần điểm đón"}
              </p>
            )}
          </div>

          {error && <Alert>{error}</Alert>}

          <Button type="submit" size="lg" loading={loading} disabled={outOfArea} className="w-full">
            {tripType === "SHARED" ? "Tìm xe ghép" : "Đặt xe ngay"}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <MapView
            tiles={tiles}
            markers={markers}
            polylines={polylines}
            polygons={polygons}
            circles={circles}
            fitKey={`${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}`}
            onClick={onMapClick}
            height="min(70vh, 640px)"
            className={`shadow-[var(--shadow-card)] ${picking ? "cursor-crosshair ring-4 ring-brand-500/30" : ""}`}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 px-1">
            <Legend color="bg-emerald-500" label="Điểm đón" />
            <Legend color="bg-orange-500" label="Điểm trả" />
            <Legend color="bg-blue-600" label="Tài xế đang trực" />
            <Legend color="bg-cyan-600/40 ring-1 ring-cyan-600" label="Khu vực phục vụ" />
            <span className="ml-auto">{resolving ? "Đang tìm địa chỉ…" : picking ? "Chạm lên bản đồ để đặt điểm" : "Kéo ghim A/B để chỉnh vị trí"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
