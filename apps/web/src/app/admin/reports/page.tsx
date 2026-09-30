"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { parsePolygonInput, ZonePolygonEditor } from "@/components/zone-polygon-editor";
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Field, Icon, Input, PageHeader, Select, Stat, type Tone } from "@/components/ui";

const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";
const W_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Chờ duyệt", tone: "amber" },
  APPROVED: { label: "Đã duyệt", tone: "blue" },
  PAID: { label: "Đã chuyển", tone: "green" },
  REJECTED: { label: "Từ chối", tone: "red" },
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [ov, setOv] = useState<any | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [zoneStats, setZoneStats] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [sla, setSla] = useState<any | null>(null);
  const [zone, setZone] = useState({ name: "", centerLat: "10.7769", centerLng: "106.7009", radiusKm: "5", polygonText: "" });
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [drawNew, setDrawNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.adminOverview(token, from, `${to}T23:59:59`).then(setOv).catch(() => {});
    api.allWithdrawals(token).then(setWithdrawals).catch(() => {});
    api.zones(token).then(setZones).catch(() => {});
    api.zoneStats(token, from, `${to}T23:59:59`).then((r) => setZoneStats(r.zones)).catch(() => {});
    api.allDrivers(token).then(setDrivers).catch(() => {});
    api.complaintSla(token, from, `${to}T23:59:59`).then(setSla).catch(() => {});
  }, [token, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const maxDay = Math.max(1, ...(ov?.daily.map((d: any) => d.fare) ?? [1]));
  const zoneRings = zones.filter((z) => z.polygon?.coordinates?.[0]).map((z) => ({ id: z.id, name: z.name, ring: z.polygon.coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng })) }));
  const pendingW = withdrawals.filter((w) => w.status === "REQUESTED").length;

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Báo cáo vận hành"
        description="Doanh thu, đối soát, rút tiền và khu vực phục vụ."
        action={
          <div className="flex items-center gap-2 text-sm">
            <Input type="date" className="py-1.5 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-ink-400">→</span>
            <Input type="date" className="py-1.5 w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}

      {ov && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Stat label="Doanh thu gộp" value={vnd(ov.revenue.grossFare)} icon={<Icon.chart className="h-5 w-5" />} tone="brand" />
            <Stat label="Phí nền tảng" value={vnd(ov.revenue.platformCommission)} icon={<Icon.wallet className="h-5 w-5" />} tone="green" />
            <Stat label="Trả tài xế" value={vnd(ov.revenue.driverPayout)} icon={<Icon.users className="h-5 w-5" />} tone="blue" />
            <Stat label="Chuyến hoàn thành" value={ov.trips.completed} hint={`${ov.trips.byStatus.CANCELLED ?? 0} huỷ · ${ov.trips.distanceKm} km`} icon={<Icon.route className="h-5 w-5" />} tone="amber" />
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 mb-5">
            <Card>
              <CardTitle description={`Xe ghép ${ov.trips.byType.SHARED?.count ?? 0} · bao xe ${ov.trips.byType.PRIVATE?.count ?? 0} · tài xế trực/chạy ${ov.fleet.AVAILABLE ?? 0}/${ov.fleet.ON_TRIP ?? 0} · khiếu nại mở ${ov.openComplaints ?? 0}`}>Doanh thu theo ngày</CardTitle>
              {ov.daily.length === 0 && <EmptyState icon={<Icon.chart className="h-6 w-6" />} title="Không có chuyến hoàn thành" description="Chọn khoảng thời gian khác." />}
              <div className="flex flex-col gap-1.5 text-xs">
                {ov.daily.map((d: any) => (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="w-16 text-ink-500 tabular-nums">{new Date(d.day).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span>
                    <div className="flex-1 bg-ink-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-brand-500 h-full rounded-full" style={{ width: `${(d.fare / maxDay) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right font-medium text-ink-800 tabular-nums">{vnd(d.fare)}</span>
                    <span className="w-12 text-right text-ink-400 tabular-nums">{d.trips} ch.</span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardTitle>Đối soát thanh toán</CardTitle>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Phương thức</th>
                      <th>Trạng thái</th>
                      <th className="text-right">Chuyến</th>
                      <th className="text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.revenue.payments.map((p: any) => (
                      <tr key={`${p.method}-${p.status}`}>
                        <td className="text-ink-800">{p.method === "WALLET" ? "Ví" : "Tiền mặt"}</td>
                        <td>
                          <Badge tone={p.status === "PAID" ? "green" : "amber"}>{p.status === "PAID" ? "Đã thu" : "Chờ xác nhận"}</Badge>
                        </td>
                        <td className="text-right tabular-nums">{p.count}</td>
                        <td className="text-right font-medium tabular-nums">{vnd(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card>
                <CardTitle>Top tài xế</CardTitle>
                <ol className="divide-y divide-ink-100 text-sm">
                  {ov.topDrivers.length === 0 && <li className="py-2 text-ink-500">Chưa có dữ liệu.</li>}
                  {ov.topDrivers.map((d: any, i: number) => (
                    <li key={d.driverId} className="py-2.5 flex items-center gap-3">
                      <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-800" : "bg-ink-100 text-ink-600"}`}>{i + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-ink-900 truncate">{d.fullName}</span>
                        <span className="text-xs text-ink-500">{d.trips} chuyến · {d.ratingAvg} ★</span>
                      </span>
                      <span className="font-semibold text-ink-900 tabular-nums">{vnd(d.fare)}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        </>
      )}

      {sla && (
        <Card className="mb-5">
          <CardTitle
            description={`${sla.total} khiếu nại trong khoảng · ${sla.resolved} đã đóng · đang mở ${sla.backlog.open} (${sla.backlog.overdue} quá hạn, ${sla.backlog.unassigned} chưa phân công)`}
            action={
              <a href="/admin/complaints" className="link text-sm">
                Mở hộp thư khiếu nại
              </a>
            }
          >
            SLA khiếu nại
          </CardTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Phản hồi đúng hạn" value={sla.firstResponseWithinSlaPct != null ? `${sla.firstResponseWithinSlaPct}%` : "—"} hint={sla.avgFirstResponseMin != null ? `TB ${sla.avgFirstResponseMin} phút` : "Chưa có dữ liệu"} tone="brand" />
            <Stat label="Giải quyết đúng hạn" value={sla.resolvedWithinSlaPct != null ? `${sla.resolvedWithinSlaPct}%` : "—"} hint={sla.avgResolveMin != null ? `TB ${Math.round(sla.avgResolveMin / 6) / 10} giờ` : "Chưa có dữ liệu"} tone="green" />
            <Stat label="Quá hạn hiện tại" value={sla.backlog.overdue} tone={sla.backlog.overdue > 0 ? "red" : "slate"} />
            <Stat label="Chưa phân công" value={sla.backlog.unassigned} tone={sla.backlog.unassigned > 0 ? "amber" : "slate"} />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Ưu tiên</th>
                  <th>Phản hồi đầu tiên</th>
                  <th>Giải quyết</th>
                  <th className="text-right">Số khiếu nại</th>
                  <th className="text-right">Giải quyết đúng hạn</th>
                </tr>
              </thead>
              <tbody>
                {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
                  <tr key={p}>
                    <td className="font-medium text-ink-900">{{ URGENT: "Khẩn cấp", HIGH: "Cao", NORMAL: "Bình thường", LOW: "Thấp" }[p]}</td>
                    <td className="text-ink-600">{fmtClock(sla.policy[p].firstResponseMin)}</td>
                    <td className="text-ink-600">{fmtClock(sla.policy[p].resolveMin)}</td>
                    <td className="text-right tabular-nums">{sla.byPriority[p]?.total ?? 0}</td>
                    <td className="text-right tabular-nums">{sla.byPriority[p]?.resolvedWithinSla != null ? `${sla.byPriority[p].resolvedWithinSla}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mb-5">
        <CardTitle action={pendingW > 0 ? <Badge tone="amber">{pendingW} chờ duyệt</Badge> : undefined}>Yêu cầu rút tiền</CardTitle>
        {withdrawals.length === 0 && <EmptyState title="Chưa có yêu cầu rút tiền" />}
        {withdrawals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Tài xế</th>
                  <th>Ngân hàng</th>
                  <th className="text-right">Số tiền</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => {
                  const st = W_STATUS[w.status] ?? { label: w.status, tone: "slate" as Tone };
                  return (
                    <tr key={w.id}>
                      <td>
                        <span className="block font-medium text-ink-900">{w.driver?.user?.fullName}</span>
                        <span className="text-xs text-ink-500">{w.driver?.user?.phone} · {new Date(w.createdAt).toLocaleDateString("vi-VN")}</span>
                      </td>
                      <td className="text-ink-600">
                        {w.bankName} <span className="font-mono">{w.bankAccount}</span>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{vnd(w.amount)}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {w.note && <span className="block text-xs text-ink-400 mt-0.5">{w.note}</span>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {w.status === "REQUESTED" && (
                          <span className="inline-flex gap-1.5">
                            <Button size="sm" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "APPROVED" }))}>Duyệt</Button>
                            <Button size="sm" variant="secondary" className="text-red-600" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "REJECTED", note: prompt("Lý do từ chối") ?? undefined }))}>
                              Từ chối
                            </Button>
                          </span>
                        )}
                        {w.status === "APPROVED" && (
                          <Button size="sm" variant="soft" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "PAID" }))}>
                            Đã chuyển khoản
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <CardTitle description="Đa giác (PostGIS) hoặc hình tròn tâm + bán kính; điểm thuộc khu vực nhỏ nhất chứa nó. Điểm đón ngoài mọi khu vực đang hoạt động sẽ không đặt được xe; khách chỉ ghép chung nhóm trong cùng khu vực.">
          Khu vực hoạt động
        </CardTitle>
        <form
          className="rounded-2xl border border-dashed border-ink-200 p-4 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parsePolygonInput(zone.polygonText);
            if (parsed.error) {
              setError(parsed.error);
              return;
            }
            run(async () => {
              await api.createZone(token!, {
                name: zone.name,
                ...(parsed.ring ? { polygon: { type: "Polygon", coordinates: [parsed.ring] } } : { centerLat: Number(zone.centerLat), centerLng: Number(zone.centerLng), radiusKm: Number(zone.radiusKm) }),
              });
              setZone({ ...zone, name: "", polygonText: "" });
              setDrawNew(false);
            });
          }}
        >
          <div className="grid sm:grid-cols-[1.5fr_1fr_1fr_0.8fr_auto_auto] gap-2 items-end">
            <Field label="Tên khu vực">
              <Input placeholder="Quận 1" value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} required />
            </Field>
            <Field label="Tâm (lat)">
              <Input value={zone.centerLat} onChange={(e) => setZone({ ...zone, centerLat: e.target.value })} />
            </Field>
            <Field label="Tâm (lng)">
              <Input value={zone.centerLng} onChange={(e) => setZone({ ...zone, centerLng: e.target.value })} />
            </Field>
            <Field label="Bán kính km">
              <Input value={zone.radiusKm} onChange={(e) => setZone({ ...zone, radiusKm: e.target.value })} />
            </Field>
            <Button type="button" variant={drawNew ? "dark" : "secondary"} onClick={() => setDrawNew((v) => !v)}>
              <Icon.map className="h-4 w-4" />
              {drawNew ? "Ẩn bản đồ" : "Vẽ đa giác"}
            </Button>
            <Button type="submit">Thêm khu vực</Button>
          </div>
          {drawNew && (
            <div className="mt-4">
              <ZonePolygonEditor token={token} initial={null} center={{ lat: Number(zone.centerLat) || 10.7769, lng: Number(zone.centerLng) || 106.7009 }} otherZones={zoneRings} onChange={(text) => setZone((z) => ({ ...z, polygonText: text }))} />
              <p className="text-xs text-ink-500 mt-2">Có đa giác thì tâm/bán kính bị bỏ qua; khu vực khác hiện màu xám để tránh chồng lấn.</p>
            </div>
          )}
        </form>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Khu vực</th>
                <th>Hình dạng</th>
                <th>Bán kính</th>
                <th className="text-right">Tài xế</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zones.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-ink-500 py-6">Chưa có khu vực nào — hệ thống phục vụ mọi nơi.</td>
                </tr>
              )}
              {zones.map((z) => (
                <Fragment key={z.id}>
                  <tr>
                    <td className="font-medium text-ink-900">{z.name}</td>
                    <td>
                      <button className="link" onClick={() => setEditingZone(editingZone === z.id ? null : z.id)}>
                        {z.polygon ? `Đa giác · ${Number(z.areaKm2).toFixed(1)} km²` : "Hình tròn"} {editingZone === z.id ? "▲" : "▼"}
                      </button>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1">
                        <Input type="number" className="py-1 w-20 text-sm" defaultValue={z.radiusKm} min={0.5} step={0.5} onBlur={(e) => Number(e.target.value) !== z.radiusKm && run(() => api.updateZone(token!, z.id, { radiusKm: Number(e.target.value) }))} />
                        <span className="text-xs text-ink-500">km</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{z._count?.drivers ?? 0}</td>
                    <td>
                      <button onClick={() => run(() => api.updateZone(token!, z.id, { isActive: !z.isActive }))}>
                        <Badge tone={z.isActive ? "green" : "slate"} dot>
                          {z.isActive ? "Đang hoạt động" : "Tạm dừng"}
                        </Badge>
                      </button>
                    </td>
                    <td className="text-right">
                      <button className="text-xs text-red-600 hover:underline" onClick={() => confirm(`Xoá khu vực ${z.name}?`) && run(() => api.deleteZone(token!, z.id))}>
                        Xoá
                      </button>
                    </td>
                  </tr>
                  {editingZone === z.id && (
                    <tr>
                      <td colSpan={6} className="bg-ink-50/60 p-4">
                        <ZonePolygonEditor
                          token={token}
                          initial={z.polygon?.coordinates?.[0] ?? null}
                          center={{ lat: z.centerLat, lng: z.centerLng }}
                          otherZones={zoneRings.filter((r) => r.id !== z.id)}
                          onSave={(ring) => run(() => api.updateZone(token!, z.id, { polygon: { type: "Polygon", coordinates: [ring] } }))}
                          onClear={() => run(() => api.updateZone(token!, z.id, { polygon: null }))}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {zoneStats.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">Thống kê theo khu vực</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Khu vực</th>
                  <th className="text-right">Yêu cầu</th>
                  <th className="text-right">Hoàn thành</th>
                  <th className="text-right">Huỷ</th>
                  <th className="text-right">Doanh thu</th>
                  <th className="text-right">Tài xế (trực)</th>
                </tr>
              </thead>
              <tbody>
                {zoneStats.map((z) => (
                  <tr key={z.id ?? "none"}>
                    <td className="font-medium text-ink-900">{z.name}</td>
                    <td className="text-right tabular-nums">{z.requested}</td>
                    <td className="text-right tabular-nums">{z.completed}</td>
                    <td className="text-right tabular-nums">{z.cancelled}</td>
                    <td className="text-right tabular-nums font-medium">{vnd(z.grossFare)}</td>
                    <td className="text-right tabular-nums">
                      {z.drivers} ({z.driversOnline})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle description="Tài xế đã gán chỉ thấy và nhận chuyến trong khu vực đó; chưa gán thì nhận mọi khu vực.">Gán tài xế vào khu vực</CardTitle>
        <div className="overflow-x-auto">
          <table className="table">
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-ink-900">{d.user?.fullName}</td>
                  <td className="text-ink-500 text-xs">{d.user?.phone}</td>
                  <td className="text-right">
                    <Select className="py-1.5 w-56 inline-block text-sm" value={d.zoneId ?? ""} onChange={(e) => run(() => api.assignZone(token!, d.id, e.target.value || null))}>
                      <option value="">— mọi khu vực —</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function fmtClock(min: number) {
  return min < 60 ? `${min} phút` : min % 60 === 0 ? `${min / 60} giờ` : `${Math.round(min / 6) / 10} giờ`;
}
