"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { MapView, type MapCircle, type MapMarker, type MapPolygon } from "@/components/map-view";
import { useMapTiles } from "@/lib/map";
import { Badge, Card, CardTitle, EmptyState, Icon, PageHeader, Select, Stat, type Tone } from "@/components/ui";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const CONF: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Độ tin cậy thấp", tone: "amber" },
  medium: { label: "Độ tin cậy vừa", tone: "blue" },
  high: { label: "Độ tin cậy cao", tone: "green" },
};

/** Sequential teal ramp for the 7×24 heat grid (0 → transparent, max → brand-700). */
function heat(v: number, max: number) {
  if (max <= 0 || v <= 0) return "transparent";
  const t = Math.min(1, v / max);
  return `rgba(11, 140, 117, ${0.12 + t * 0.78})`;
}

export default function ForecastPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const tiles = useMapTiles(token);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [weeks, setWeeks] = useState(8);
  const [profile, setProfile] = useState<any | null>(null);
  const [fc, setFc] = useState<any | null>(null);
  const [hs, setHs] = useState<any | null>(null);
  const [slotHours, setSlotHours] = useState(2);
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.forecastProfile(token, zoneId || undefined, weeks).then(setProfile).catch(() => setProfile(null));
    api.forecast(token, zoneId || undefined, 24, weeks).then(setFc).catch(() => setFc(null));
    api.forecastHotspots(token, { zoneId: zoneId || undefined, hours: slotHours, limit: 15 }).then(setHs).catch(() => setHs(null));
  }, [token, zoneId, weeks, slotHours]);

  useEffect(() => {
    if (!token) return;
    api.zones(token).then(setZones).catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const maxDemand = useMemo(() => Math.max(0.01, ...((profile?.demand as number[]) ?? [0])), [profile]);
  const maxHour = useMemo(() => Math.max(0.01, ...((fc?.hours ?? []).flatMap((h: any) => [h.demand, h.capacity]) as number[])), [fc]);

  const { markers, circles, polygons } = useMemo(() => {
    const markers: MapMarker[] = [];
    const circles: MapCircle[] = [];
    const polygons: MapPolygon[] = [];
    const maxReq = Math.max(0.01, ...((hs?.hotspots ?? []).map((h: any) => h.expectedRequests) as number[]));
    for (const h of hs?.hotspots ?? []) {
      circles.push({
        id: h.key,
        center: { lat: h.lat, lng: h.lng },
        radiusMeters: 250 + 500 * Math.sqrt(h.expectedRequests / maxReq),
        color: h.undersupplied ? "#dc2626" : "#0b8c75",
        title: `${h.expectedRequests} yêu cầu/giờ · ${h.driversNearby} tài xế gần${h.undersupplied ? " · thiếu xe" : ""}`,
      });
    }
    for (const z of zones) {
      if (!z.isActive || (zoneId && z.id !== zoneId)) continue;
      const ring = z.polygon?.coordinates?.[0];
      if (ring) polygons.push({ id: z.id, ring: ring.map(([lng, lat]: [number, number]) => ({ lat, lng })), title: z.name, color: "#94a3b8" });
    }
    return { markers, circles, polygons };
  }, [hs, zones, zoneId]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const conf = CONF[fc?.confidence ?? "low"];
  const peakSlot = profile?.peak;

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Dự báo nhu cầu"
        description="Nhu cầu theo giờ trong tuần ước lượng từ lịch sử đặt xe (tuần gần được tính nặng hơn), so với số tài xế thường trực cùng giờ."
        action={
          <div className="flex items-center gap-2 text-sm">
            <Select className="py-1.5 w-44" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">Toàn hệ thống</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
            <Select className="py-1.5 w-32" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w} tuần
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {fc && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Stat label="Yêu cầu dự kiến 24h tới" value={fc.summary.expectedRequests} hint={`${fc.tripsPerDriverHour} chuyến / giờ trực`} icon={<Icon.chart className="h-5 w-5" />} tone="brand" />
          <Stat label="Giờ cao điểm" value={fc.summary.peak?.label ?? "—"} hint={fc.summary.peak ? `${fc.summary.peak.demand} yêu cầu` : undefined} icon={<Icon.clock className="h-5 w-5" />} tone="amber" />
          <Stat label="Giờ thiếu xe" value={fc.summary.understaffedHours} hint="trong 24 giờ tới" icon={<Icon.alert className="h-5 w-5" />} tone={fc.summary.understaffedHours > 0 ? "red" : "green"} />
          <Stat label="Cần thêm tài xế" value={fc.summary.driversNeeded} hint="ở giờ thiếu nhất" icon={<Icon.users className="h-5 w-5" />} tone={fc.summary.driversNeeded > 0 ? "amber" : "slate"} />
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5 items-start mb-5">
        <Card>
          <CardTitle description={`Dựa trên ${profile?.totalRequests ?? 0} yêu cầu trong ${profile?.sampleWeeks ?? 0}/${weeks} tuần có dữ liệu · múi giờ ${profile?.timeZone ?? ""}`} action={<Badge tone={conf.tone}>{conf.label}</Badge>}>
            Bản đồ nhiệt giờ trong tuần
          </CardTitle>
          {!profile || profile.totalRequests === 0 ? (
            <EmptyState icon={<Icon.chart className="h-6 w-6" />} title="Chưa có lịch sử đặt xe" description="Dự báo sẽ hình thành sau tuần đầu vận hành." />
          ) : (
            <div className="overflow-x-auto">
              <div className="grid gap-[3px] min-w-[560px]" style={{ gridTemplateColumns: "28px repeat(24, minmax(0,1fr))" }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-[10px] text-ink-400 text-center tabular-nums">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
                {DOW.map((d, dow) => (
                  <div key={d} className="contents">
                    <div className="text-[11px] font-medium text-ink-600 flex items-center">{d}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const v = profile.demand[dow * 24 + hour];
                      const s = profile.supply[dow * 24 + hour];
                      const isPeak = peakSlot && peakSlot.idx === dow * 24 + hour && v > 0;
                      return (
                        <div
                          key={hour}
                          onMouseEnter={() => setHover({ dow, hour })}
                          onMouseLeave={() => setHover(null)}
                          className={`h-6 rounded-[4px] bg-ink-100 relative ${isPeak ? "ring-2 ring-amber-400" : ""}`}
                          title={`${d} ${hour}h · ${v} yêu cầu · ${s} tài xế trực`}
                        >
                          <div className="absolute inset-0 rounded-[4px]" style={{ background: heat(v, maxDemand) }} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                <span>
                  {hover ? `${DOW[hover.dow]} ${hover.hour}h: ${profile.demand[hover.dow * 24 + hover.hour]} yêu cầu · ${profile.supply[hover.dow * 24 + hover.hour]} tài xế trực` : "Di chuột lên ô để xem chi tiết"}
                </span>
                <span className="inline-flex items-center gap-1">
                  ít
                  {[0.1, 0.3, 0.55, 0.8, 1].map((t) => (
                    <span key={t} className="h-3 w-5 rounded-sm" style={{ background: heat(t, 1) }} />
                  ))}
                  nhiều
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle description="Cầu (đậm) so với năng lực phục vụ ước tính từ số tài xế thường trực cùng giờ.">24 giờ tới</CardTitle>
          {!fc ? (
            <EmptyState title="Đang tải…" />
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {fc.hours.map((h: any, i: number) => (
                <li key={h.at} className="grid grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-2">
                  <span className={`tabular-nums ${i === 0 ? "font-semibold text-ink-900" : "text-ink-500"}`}>{h.label}</span>
                  <span className="relative h-4 rounded bg-ink-100 overflow-hidden">
                    <span className="absolute inset-y-0 left-0 bg-brand-200" style={{ width: `${(h.capacity / maxHour) * 100}%` }} />
                    <span className={`absolute inset-y-1 left-0 rounded-r ${h.gap > 0 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${(h.demand / maxHour) * 100}%` }} />
                  </span>
                  <span className={`text-right tabular-nums ${h.gap > 0 ? "text-red-600 font-medium" : "text-ink-500"}`}>
                    {h.demand} / {h.capacity}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-ink-500">Cột: yêu cầu dự kiến / năng lực (tài xế trực × chuyến mỗi giờ). Đỏ khi cầu vượt năng lực.</p>
        </Card>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-ink-900">Điểm nóng đón khách</h2>
            <p className="text-sm text-ink-500">Ô ~1 km có nhiều yêu cầu nhất cho khung {hs?.slots?.join(", ") ?? "…"}; đỏ khi số tài xế đang trực gần đó ít hơn số yêu cầu dự kiến.</p>
          </div>
          <Select className="py-1.5 w-40" value={slotHours} onChange={(e) => setSlotHours(Number(e.target.value))}>
            <option value={1}>Giờ hiện tại</option>
            <option value={2}>2 giờ tới</option>
            <option value={3}>3 giờ tới</option>
            <option value={6}>6 giờ tới</option>
          </Select>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="p-2">
            <MapView tiles={tiles} markers={markers} circles={circles} polygons={polygons} fitKey={`${zoneId}:${slotHours}:${hs?.hotspots?.length ?? 0}`} height={420} />
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-ink-100 p-3 max-h-[420px] overflow-y-auto">
            {(!hs || hs.hotspots.length === 0) && <EmptyState icon={<Icon.pin className="h-6 w-6" />} title="Chưa có điểm nóng" description="Cần lịch sử đặt xe ở khung giờ này." />}
            <ol className="divide-y divide-ink-100 text-sm">
              {hs?.hotspots.map((h: any, i: number) => (
                <li key={h.key} className="py-2.5 flex items-center gap-3">
                  <span className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${h.undersupplied ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-800"}`}>{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-ink-900 font-mono text-xs">
                      {h.lat.toFixed(3)}, {h.lng.toFixed(3)}
                    </span>
                    <span className="text-xs text-ink-500">
                      {h.expectedRequests} yêu cầu/giờ · {h.driversNearby} tài xế trong 1 km · {h.weeksWithData} tuần dữ liệu
                    </span>
                  </span>
                  {h.undersupplied ? <Badge tone="red">Thiếu xe</Badge> : <Badge tone="green">Đủ xe</Badge>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
