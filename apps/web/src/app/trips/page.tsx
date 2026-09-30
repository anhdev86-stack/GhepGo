"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { useNow, useRealtime, useSocketEvent, WS, type DriverLocation } from "@/lib/realtime";
import { TripMap } from "@/components/trip-map";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Icon, LinkButton, LiveDot, PageHeader, RouteLine, type Tone } from "@/components/ui";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Đang tìm tài xế", tone: "amber" },
  ASSIGNED: { label: "Đã ghép nhóm, đang tìm tài xế", tone: "amber" },
  ACCEPTED: { label: "Tài xế đã nhận", tone: "blue" },
  EN_ROUTE_TO_PICKUP: { label: "Tài xế đang tới đón", tone: "blue" },
  IN_PROGRESS: { label: "Đang di chuyển", tone: "brand" },
  COMPLETED: { label: "Hoàn thành", tone: "green" },
  CANCELLED: { label: "Đã huỷ", tone: "slate" },
};

/** History page size; the live trips are always loaded in full. */
const PAGE = 20;

const STEPS = ["REQUESTED", "ACCEPTED", "EN_ROUTE_TO_PICKUP", "IN_PROGRESS", "COMPLETED"];
const STEP_LABEL = ["Đặt xe", "Đã nhận", "Đang tới", "Trên xe", "Hoàn thành"];
const CANCELLABLE = ["REQUESTED", "ASSIGNED", "ACCEPTED", "EN_ROUTE_TO_PICKUP"];
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

function Stepper({ status }: { status: string }) {
  const idx = status === "ASSIGNED" ? 0 : STEPS.indexOf(status);
  if (idx < 0) return null;
  return (
    <ol className="flex items-center gap-1 sm:gap-2 text-[11px]">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={s} className="flex items-center gap-1 sm:gap-2 flex-1 last:flex-none">
            <span
              className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center font-semibold ${
                done ? "bg-brand-600 text-white" : current ? "bg-brand-100 text-brand-800 ring-4 ring-brand-500/15" : "bg-ink-100 text-ink-400"
              }`}
            >
              {done ? <Icon.check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`hidden sm:inline ${current ? "text-ink-900 font-medium" : "text-ink-500"}`}>{STEP_LABEL[i]}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-brand-500" : "bg-ink-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function TripsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const { socket, connected } = useRealtime(token);
  const now = useNow();
  const [liveTrips, setLiveTrips] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const historyLoaded = useRef(false);
  const [locations, setLocations] = useState<Record<string, DriverLocation>>({});
  const [error, setError] = useState<string | null>(null);

  // Refresh = live trips + the newest history page, merged in front of any older pages already loaded.
  const load = useCallback(() => {
    if (!token) return;
    Promise.all([api.myTrips(token, { scope: "active", take: 100 }), api.myTrips(token, { scope: "history", take: PAGE })])
      .then(([live, first]) => {
        setLiveTrips(live);
        if (!historyLoaded.current) {
          historyLoaded.current = true;
          setHasMore(first.length === PAGE);
        }
        const ids = new Set(first.map((t) => t.id));
        setHistory((prev) => (prev ? first.concat(prev.filter((t) => !ids.has(t.id))) : first));
      })
      .catch(() => {});
  }, [token]);

  const loadMore = async () => {
    if (!token || !history?.length) return;
    setLoadingMore(true);
    try {
      const page = await api.myTrips(token, { scope: "history", take: PAGE, cursor: history[history.length - 1].id });
      setHistory((prev) => {
        const ids = new Set((prev ?? []).map((t) => t.id));
        return [...(prev ?? []), ...page.filter((t) => !ids.has(t.id))];
      });
      setHasMore(page.length === PAGE);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải thêm được lịch sử");
    } finally {
      setLoadingMore(false);
    }
  };
  const trips = liveTrips && history ? [...liveTrips, ...history] : null;

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  // Join the room of every active trip so we receive its driver's GPS.
  useEffect(() => {
    if (!socket || !liveTrips) return;
    for (const t of liveTrips) socket.emit(WS.SUBSCRIBE_TRIP, { tripId: t.id });
  }, [socket, liveTrips]);

  useSocketEvent(socket, WS.TRIP_UPDATED, load);
  useSocketEvent(socket, WS.GROUP_UPDATED, load);
  useSocketEvent<DriverLocation>(socket, WS.DRIVER_LOCATION, (loc) => setLocations((prev) => ({ ...prev, [loc.driverId]: loc })));

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

  const active = liveTrips ?? [];
  const past = history ?? [];

  return (
    <div>
      <PageHeader title="Chuyến của tôi" description="Theo dõi xe đang tới và xem lại lịch sử di chuyển." action={<LiveDot connected={connected} label={connected ? "Cập nhật trực tiếp" : "Mất kết nối realtime"} />} />
      {error && <Alert className="mb-4">{error}</Alert>}

      {trips && trips.length === 0 && (
        <Card>
          <EmptyState icon={<Icon.car className="h-6 w-6" />} title="Chưa có chuyến đi nào" description="Đặt chuyến đầu tiên của bạn, giá hiện trước khi đặt." action={<LinkButton href="/book">Đặt xe ngay</LinkButton>} />
        </Card>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Đang diễn ra</h2>
          <div className="grid gap-4">
            {active.map((trip) => {
              const loc = trip.driverId ? locations[trip.driverId] : undefined;
              const group = trip.group;
              const myStops = group?.stops?.filter((s: any) => s.tripId === trip.id) ?? [];
              const stopsAhead = myStops.length ? Math.max(0, myStops[0].sequence - (group.currentStopIndex ?? 0)) : null;
              const st = STATUS[trip.status] ?? { label: trip.status, tone: "slate" as Tone };
              return (
                <Card key={trip.id} padded={false} className="overflow-hidden">
                  <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="order-2 lg:order-1 p-5 sm:p-6 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                          <p className="mt-2 text-lg font-semibold text-ink-900">{vnd(trip.fare)}</p>
                          <p className="text-xs text-ink-500">
                            {trip.tripType === "SHARED" ? "Xe ghép" : "Bao xe"} · {trip.paymentMethod === "WALLET" ? "ví GhepGo" : "tiền mặt"}
                            {trip.surgeMultiplier > 1 ? ` · cao điểm ×${trip.surgeMultiplier}` : ""}
                            {trip.discountAmount > 0 ? ` · giảm ${vnd(trip.discountAmount)} (${trip.promoCode})` : ""}
                          </p>
                        </div>
                        {CANCELLABLE.includes(trip.status) && (
                          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => cancel(trip.id)}>
                            Huỷ chuyến
                          </Button>
                        )}
                      </div>

                      <Stepper status={trip.status} />

                      <RouteLine pickup={trip.pickupAddress} dropoff={trip.dropoffAddress} />

                      {trip.driver && (
                        <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
                          <Avatar name={trip.driver.user?.fullName} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink-900 truncate">{trip.driver.user?.fullName}</p>
                            <p className="text-xs text-ink-500">
                              {trip.vehicle ? `${trip.vehicle.make} ${trip.vehicle.model} · ${trip.vehicle.plateNumber}` : "Đang cập nhật xe"}
                              {trip.driver.ratingAvg ? ` · ${Number(trip.driver.ratingAvg).toFixed(1)} ★` : ""}
                            </p>
                          </div>
                          {loc && (
                            <div className="text-right text-xs">
                              <p className="text-emerald-700 font-medium">{loc.speed != null && loc.speed > 0.5 ? `${Math.round(loc.speed * 3.6)} km/h` : "Đang dừng"}</p>
                              <p className="text-ink-400">{Math.max(0, Math.round((now - loc.updatedAt) / 1000))}s trước</p>
                            </div>
                          )}
                        </div>
                      )}

                      {trip.tripType === "SHARED" && group && (
                        <div className="rounded-xl border border-ink-200/70 p-3 text-sm">
                          <p className="font-medium text-ink-900">
                            Nhóm {group.trips?.length ?? group.seatsUsed} khách · điểm dừng {(group.currentStopIndex ?? 0) + 1}/{group.stops?.length ?? 0}
                            {stopsAhead !== null && trip.status !== "IN_PROGRESS" && <span className="text-ink-500 font-normal"> · còn {stopsAhead} điểm trước khi đón bạn</span>}
                          </p>
                          <ol className="mt-2 space-y-1 text-xs">
                            {group.stops?.map((s: any, i: number) => {
                              const done = i < group.currentStopIndex;
                              const mine = s.tripId === trip.id;
                              return (
                                <li key={s.id} className={`flex gap-2 ${done ? "text-ink-400 line-through" : mine ? "text-ink-900 font-medium" : "text-ink-600"}`}>
                                  <span className={`h-4 w-4 shrink-0 rounded-full text-[10px] flex items-center justify-center ${done ? "bg-ink-200" : s.kind === "PICKUP" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}>{i + 1}</span>
                                  <span className="truncate">
                                    {s.kind === "PICKUP" ? "Đón" : "Trả"} · {s.address}
                                    {mine ? " (bạn)" : ""}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </div>
                    <div className="order-1 lg:order-2 border-b lg:border-b-0 lg:border-l border-ink-100 p-2 lg:p-3 bg-ink-50/40">
                      <TripMap token={token} trip={trip} driverLocation={loc ?? null} height={300} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Lịch sử</h2>
          <Card padded={false} className="divide-y divide-ink-100">
            {past.map((trip) => {
              const st = STATUS[trip.status] ?? { label: trip.status, tone: "slate" as Tone };
              const openComplaint = trip.complaints?.find((c: any) => ["OPEN", "IN_REVIEW"].includes(c.status));
              return (
                <div key={trip.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="text-xs text-ink-400">{new Date(trip.requestedAt).toLocaleString("vi-VN")}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-ink-800 truncate">
                      {trip.pickupAddress} <span className="text-ink-400">→</span> {trip.dropoffAddress}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {[
                        trip.driver?.user?.fullName,
                        (trip.payment?.method ?? trip.paymentMethod) === "WALLET" ? "ví" : "tiền mặt",
                        trip.payment ? (trip.payment.status === "PAID" ? "đã thanh toán" : "chờ xác nhận") : null,
                        trip.discountAmount > 0 ? `giảm ${vnd(trip.discountAmount)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <span className="font-semibold text-ink-900">{vnd(trip.fare)}</span>
                    {trip.status === "COMPLETED" && !trip.rating && (
                      <div className="flex items-center gap-0.5" title="Đánh giá tài xế">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} onClick={() => rate(trip.id, s)} className="text-ink-300 hover:text-amber-400 hover:scale-110 transition" aria-label={`${s} sao`}>
                            <Icon.star className="h-5 w-5" />
                          </button>
                        ))}
                      </div>
                    )}
                    {trip.rating && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <Icon.star className="h-3.5 w-3.5" /> {trip.rating.score}/5
                      </span>
                    )}
                    {["COMPLETED", "CANCELLED"].includes(trip.status) && (
                      <a href={openComplaint ? `/complaints?id=${openComplaint.id}` : `/complaints?tripId=${trip.id}`} className={`text-xs ${openComplaint ? "text-orange-600 font-medium" : "text-ink-400 hover:text-ink-700"}`}>
                        {openComplaint ? "Khiếu nại đang xử lý" : "Báo cáo sự cố"}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                Xem thêm chuyến cũ hơn
              </Button>
            </div>
          )}
          {!hasMore && past.length > PAGE && <p className="mt-4 text-center text-xs text-ink-400">Đã hiển thị toàn bộ {past.length} chuyến</p>}
        </section>
      )}
    </div>
  );
}
