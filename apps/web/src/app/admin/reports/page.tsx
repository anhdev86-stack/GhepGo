"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { parsePolygonInput, PolygonPreview, ZonePolygonEditor } from "@/components/zone-polygon-editor";

const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";
const W_LABEL: Record<string, string> = { REQUESTED: "Chờ duyệt", APPROVED: "Đã duyệt", PAID: "Đã chuyển", REJECTED: "Từ chối" };
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
  const [zone, setZone] = useState({ name: "", centerLat: "10.7769", centerLng: "106.7009", radiusKm: "5", polygonText: "" });
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.adminOverview(token, from, `${to}T23:59:59`).then(setOv).catch(() => {});
    api.allWithdrawals(token).then(setWithdrawals).catch(() => {});
    api.zones(token).then(setZones).catch(() => {});
    api.zoneStats(token, from, `${to}T23:59:59`).then((r) => setZoneStats(r.zones)).catch(() => {});
    api.allDrivers(token).then(setDrivers).catch(() => {});
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Báo cáo vận hành</h1>
        <div className="flex gap-2 items-center text-sm">
          <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>→</span>
          <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {ov && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ["Chuyến hoàn thành", ov.trips.completed],
              ["Doanh thu gộp", vnd(ov.revenue.grossFare)],
              ["Phí nền tảng", vnd(ov.revenue.platformCommission)],
              ["Trả tài xế", vnd(ov.revenue.driverPayout)],
              ["Km phục vụ", ov.trips.distanceKm],
              ["Huỷ", ov.trips.byStatus.CANCELLED ?? 0],
              ["Xe ghép / bao xe", `${ov.trips.byType.SHARED?.count ?? 0} / ${ov.trips.byType.PRIVATE?.count ?? 0}`],
              ["Tài xế trực / chạy", `${ov.fleet.AVAILABLE ?? 0} / ${ov.fleet.ON_TRIP ?? 0}`],
              ["Khiếu nại đang mở", ov.openComplaints ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white p-3 rounded-lg border">
                <p className="text-slate-500">{label}</p>
                <p className="text-lg font-medium">{value as string}</p>
              </div>
            ))}
          </section>

          <section className="bg-white p-4 rounded-lg border">
            <h2 className="font-medium mb-2">Doanh thu theo ngày</h2>
            {ov.daily.length === 0 && <p className="text-sm text-slate-500">Không có chuyến hoàn thành trong khoảng này.</p>}
            <div className="flex flex-col gap-1 text-xs">
              {ov.daily.map((d: any) => (
                <div key={d.day} className="flex items-center gap-2">
                  <span className="w-20 text-slate-500">{new Date(d.day).toLocaleDateString("vi-VN")}</span>
                  <div className="flex-1 bg-slate-100 rounded h-4">
                    <div className="bg-blue-500 h-4 rounded" style={{ width: `${(d.fare / maxDay) * 100}%` }} />
                  </div>
                  <span className="w-28 text-right">{vnd(d.fare)}</span>
                  <span className="w-14 text-right text-slate-500">{d.trips} ch.</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-4 rounded-lg border">
            <h2 className="font-medium mb-2">Đối soát thanh toán</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th>Phương thức</th><th>Trạng thái</th><th>Số chuyến</th><th>Số tiền</th></tr></thead>
              <tbody>
                {ov.revenue.payments.map((p: any) => (
                  <tr key={`${p.method}-${p.status}`} className="border-t">
                    <td>{p.method === "WALLET" ? "Ví" : "Tiền mặt"}</td>
                    <td>{p.status === "PAID" ? "Đã thu" : "Chờ xác nhận"}</td>
                    <td>{p.count}</td>
                    <td>{vnd(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-white p-4 rounded-lg border">
            <h2 className="font-medium mb-2">Top tài xế</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th>Tài xế</th><th>Chuyến</th><th>Doanh thu</th><th>Đánh giá</th></tr></thead>
              <tbody>
                {ov.topDrivers.map((d: any) => (
                  <tr key={d.driverId} className="border-t"><td>{d.fullName}</td><td>{d.trips}</td><td>{vnd(d.fare)}</td><td>{d.ratingAvg} ★</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Yêu cầu rút tiền ({withdrawals.filter((w) => w.status === "REQUESTED").length} chờ duyệt)</h2>
        {withdrawals.length === 0 && <p className="text-sm text-slate-500">Chưa có yêu cầu.</p>}
        <table className="w-full text-sm">
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="py-1">{w.driver?.user?.fullName} · {w.driver?.user?.phone}</td>
                <td>{w.bankName} {w.bankAccount}</td>
                <td>{vnd(w.amount)}</td>
                <td>{W_LABEL[w.status] ?? w.status}</td>
                <td className="text-right space-x-1">
                  {w.status === "REQUESTED" && (
                    <>
                      <button className="text-green-700 underline" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "APPROVED" }))}>Duyệt</button>
                      <button className="text-red-600 underline" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "REJECTED", note: prompt("Lý do từ chối") ?? undefined }))}>Từ chối</button>
                    </>
                  )}
                  {w.status === "APPROVED" && (
                    <button className="text-blue-700 underline" onClick={() => run(() => api.resolveWithdrawal(token!, w.id, { status: "PAID" }))}>Đã chuyển khoản</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Khu vực hoạt động</h2>
        <form
          className="flex flex-wrap gap-2 mb-3"
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
                ...(parsed.ring
                  ? { polygon: { type: "Polygon", coordinates: [parsed.ring] } }
                  : { centerLat: Number(zone.centerLat), centerLng: Number(zone.centerLng), radiusKm: Number(zone.radiusKm) }),
              });
              setZone({ ...zone, name: "", polygonText: "" });
            });
          }}
        >
          <input className="border rounded px-2 py-1 text-sm" placeholder="Tên khu vực" value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} required />
          <input className="border rounded px-2 py-1 text-sm w-24" placeholder="Lat" value={zone.centerLat} onChange={(e) => setZone({ ...zone, centerLat: e.target.value })} />
          <input className="border rounded px-2 py-1 text-sm w-24" placeholder="Lng" value={zone.centerLng} onChange={(e) => setZone({ ...zone, centerLng: e.target.value })} />
          <input className="border rounded px-2 py-1 text-sm w-20" placeholder="Bán kính km" value={zone.radiusKm} onChange={(e) => setZone({ ...zone, radiusKm: e.target.value })} />
          <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm">Thêm khu vực</button>
          <div className="w-full flex gap-3 items-start">
            <textarea
              className="border rounded px-2 py-1 font-mono text-xs h-20 flex-1"
              placeholder="Tuỳ chọn: đa giác (GeoJSON Polygon hoặc mỗi dòng 'lat, lng'). Có đa giác thì bỏ qua tâm/bán kính."
              value={zone.polygonText}
              onChange={(e) => setZone({ ...zone, polygonText: e.target.value })}
            />
            <PolygonPreview ring={parsePolygonInput(zone.polygonText).ring ?? null} size={80} />
          </div>
        </form>
        <table className="w-full text-sm mb-3">
          <thead><tr className="text-left text-slate-500"><th>Khu vực</th><th>Hình dạng</th><th>Bán kính</th><th>Tài xế</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {zones.map((z) => (
              <Fragment key={z.id}>
              <tr className="border-t">
                <td className="py-1">{z.name}</td>
                <td>
                  <button className="underline text-blue-700" onClick={() => setEditingZone(editingZone === z.id ? null : z.id)}>
                    {z.polygon ? `Đa giác · ${Number(z.areaKm2).toFixed(1)} km²` : "Hình tròn"} {editingZone === z.id ? "▲" : "▼"}
                  </button>
                </td>
                <td>
                  <input
                    type="number"
                    className="border rounded px-1 py-0.5 w-16"
                    defaultValue={z.radiusKm}
                    min={0.5}
                    step={0.5}
                    onBlur={(e) => Number(e.target.value) !== z.radiusKm && run(() => api.updateZone(token!, z.id, { radiusKm: Number(e.target.value) }))}
                  />{" "}
                  km
                </td>
                <td>{z._count?.drivers ?? 0}</td>
                <td>
                  <button className={z.isActive ? "text-green-700 underline" : "text-slate-500 underline"} onClick={() => run(() => api.updateZone(token!, z.id, { isActive: !z.isActive }))}>
                    {z.isActive ? "Đang hoạt động" : "Tạm dừng"}
                  </button>
                </td>
                <td className="text-right">
                  <button className="text-red-600 underline" onClick={() => confirm(`Xoá khu vực ${z.name}?`) && run(() => api.deleteZone(token!, z.id))}>Xoá</button>
                </td>
              </tr>
              {editingZone === z.id && (
                <tr className="bg-slate-50">
                  <td colSpan={6} className="p-3">
                    <ZonePolygonEditor
                      initial={z.polygon?.coordinates?.[0] ?? null}
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
        <p className="text-xs text-slate-500 mb-3">
          Khu vực có đa giác dùng đa giác (PostGIS), chưa có thì dùng hình tròn tâm + bán kính; điểm thuộc khu vực nhỏ nhất chứa nó.
          Điểm đón ngoài mọi khu vực đang hoạt động sẽ không đặt được xe; khách chỉ ghép chung nhóm trong cùng khu vực;
          tài xế đã gán khu vực chỉ thấy chuyến trong khu vực đó, tài xế chưa gán nhận mọi khu vực.
        </p>
        {zoneStats.length > 0 && (
          <table className="w-full text-sm mb-3">
            <thead><tr className="text-left text-slate-500"><th>Thống kê theo khu vực</th><th>Yêu cầu</th><th>Hoàn thành</th><th>Huỷ</th><th>Doanh thu</th><th>Tài xế (trực)</th></tr></thead>
            <tbody>
              {zoneStats.map((z) => (
                <tr key={z.id ?? "none"} className="border-t">
                  <td className="py-1">{z.name}</td><td>{z.requested}</td><td>{z.completed}</td><td>{z.cancelled}</td><td>{vnd(z.grossFare)}</td><td>{z.drivers} ({z.driversOnline})</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="text-sm font-medium mb-1">Gán tài xế vào khu vực</h3>
        <table className="w-full text-sm">
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-1">{d.user?.fullName}</td>
                <td>{d.status}</td>
                <td>
                  <select className="border rounded px-1 py-0.5" value={d.zoneId ?? ""} onChange={(e) => run(() => api.assignZone(token!, d.id, e.target.value || null))}>
                    <option value="">— chưa gán —</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
