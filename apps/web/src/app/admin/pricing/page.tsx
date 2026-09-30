"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Field, Icon, Input, PageHeader, Select, Stat, type Tone } from "@/components/ui";

const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

const RULE_FIELDS: { key: string; label: string; unit?: string; step?: number; min?: number; max?: number }[] = [
  { key: "baseFare", label: "Giá mở cửa", unit: "đ", step: 1000 },
  { key: "perKm", label: "Mỗi km", unit: "đ", step: 500 },
  { key: "perMinute", label: "Mỗi phút", unit: "đ", step: 100 },
  { key: "minFare", label: "Giá tối thiểu", unit: "đ", step: 1000 },
  { key: "roundTo", label: "Làm tròn", unit: "đ", step: 100, min: 1 },
  { key: "sharedDiscountPct", label: "Giảm xe ghép", unit: "%", min: 0, max: 90 },
  { key: "nightSurchargePct", label: "Phụ thu đêm", unit: "%", min: 0, max: 200 },
  { key: "nightStartHour", label: "Đêm từ", unit: "h", min: 0, max: 23 },
  { key: "nightEndHour", label: "Đêm đến", unit: "h", min: 0, max: 23 },
  { key: "surgeMax", label: "Cao điểm tối đa", unit: "×", step: 0.1, min: 1, max: 5 },
  { key: "cancellationFee", label: "Phí huỷ muộn", unit: "đ", step: 1000 },
];

function RuleEditor({ rule, defaults, zones, onSave, onDelete, busy }: { rule: any | null; defaults: any; zones: any[]; onSave: (body: Record<string, unknown>) => void; onDelete?: () => void; busy: boolean }) {
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...defaults, ...(rule ?? {}), name: rule?.name ?? "", zoneId: rule?.zoneId ?? "" }));
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { name: form.name || undefined, surgeEnabled: !!form.surgeEnabled, isActive: form.isActive ?? true };
        for (const f of RULE_FIELDS) body[f.key] = Number(form[f.key]);
        if (!rule) body.zoneId = form.zoneId || null;
        onSave(body);
      }}
    >
      <div className="grid sm:grid-cols-[1.5fr_1fr] gap-3">
        <Field label="Tên bảng giá">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={form.zoneId ? "Bảng giá khu vực" : "Bảng giá mặc định"} />
        </Field>
        <Field label="Áp dụng cho">
          <Select value={form.zoneId} disabled={!!rule} onChange={(e) => set("zoneId", e.target.value)}>
            <option value="">Toàn hệ thống (mặc định)</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RULE_FIELDS.map((f) => (
          <Field key={f.key} label={`${f.label} (${f.unit})`}>
            <Input type="number" className="py-1.5" value={form[f.key] ?? ""} step={f.step ?? 1} min={f.min ?? 0} max={f.max} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!form.surgeEnabled} onChange={(e) => set("surgeEnabled", e.target.checked)} /> Bật giá giờ cao điểm theo cung–cầu
        </label>
        <label className="flex items-center gap-2 text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive ?? true} onChange={(e) => set("isActive", e.target.checked)} /> Đang áp dụng
        </label>
        <span className="ml-auto flex gap-2">
          {onDelete && (
            <Button type="button" variant="ghost" className="text-red-600" disabled={busy} onClick={onDelete}>
              Xoá
            </Button>
          )}
          <Button type="submit" loading={busy}>
            {rule ? "Lưu bảng giá" : "Tạo bảng giá"}
          </Button>
        </span>
      </div>
    </form>
  );
}

export default function PricingPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [defaults, setDefaults] = useState<any | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [surge, setSurge] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [redemptions, setRedemptions] = useState<{ id: string; rows: any[] } | null>(null);
  const [promo, setPromo] = useState({ code: "", description: "", type: "PERCENT", value: "10", maxDiscount: "", minFare: "0", tripType: "", perUserLimit: "1", usageLimit: "", startsAt: "", endsAt: "", firstRideOnly: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api.pricingRules(token).then((r) => { setRules(r.rules); setDefaults(r.defaults); }).catch(() => {});
    api.zones(token).then(setZones).catch(() => {});
    api.pricingSurge(token).then(setSurge).catch(() => {});
    api.promotions(token).then(setPromos).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  const globalRule = rules.find((r) => !r.zoneId);
  const activePromos = promos.filter((p) => p.isActive).length;
  const maxSurge = Math.max(1, ...surge.map((s) => s.multiplier));

  return (
    <div>
      <PageHeader eyebrow="Quản trị" title="Bảng giá & khuyến mãi" description="Giá cước theo khu vực, phụ thu đêm, giá giờ cao điểm theo cung–cầu và mã khuyến mãi. Báo giá cho khách và giá lúc đặt dùng cùng một công thức." />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Bảng giá" value={rules.length} hint={globalRule ? `Mặc định: ${globalRule.name}` : "Đang dùng mặc định hệ thống"} icon={<Icon.wallet className="h-5 w-5" />} tone="brand" />
        <Stat label="Cao điểm hiện tại" value={`×${maxSurge}`} hint={maxSurge > 1 ? "có khu vực đang thiếu xe" : "cung đủ cầu"} icon={<Icon.bolt className="h-5 w-5" />} tone={maxSurge > 1.2 ? "amber" : "green"} />
        <Stat label="Mã đang chạy" value={activePromos} hint={`${promos.length} mã tổng`} icon={<Icon.star className="h-5 w-5" />} tone="violet" />
        <Stat label="Lượt dùng mã" value={promos.reduce((s, p) => s + (p._count?.redemptions ?? 0), 0)} icon={<Icon.users className="h-5 w-5" />} tone="blue" />
      </div>

      <Card className="mb-5">
        <CardTitle
          description="Khu vực có bảng giá riêng dùng bảng đó; không có thì dùng bảng mặc định; chưa có bảng nào thì dùng hằng số hệ thống."
          action={
            <Button variant="soft" size="sm" onClick={() => setEditing(editing === "new" ? null : "new")}>
              {editing === "new" ? "Đóng" : "Thêm bảng giá"}
            </Button>
          }
        >
          Bảng giá
        </CardTitle>
        {editing === "new" && defaults && (
          <div className="rounded-2xl border border-dashed border-ink-200 p-4 mb-4">
            <RuleEditor rule={null} defaults={defaults} zones={zones.filter((z) => !rules.some((r) => r.zoneId === z.id))} busy={busy} onSave={(body) => run(async () => { await api.createPricingRule(token!, body); setEditing(null); })} />
          </div>
        )}
        {rules.length === 0 && defaults && (
          <Alert tone="slate" className="mb-3">
            Chưa có bảng giá nào. Hệ thống đang dùng mặc định: mở cửa {vnd(defaults.baseFare)}, {vnd(defaults.perKm)}/km, tối thiểu {vnd(defaults.minFare)}, xe ghép giảm {defaults.sharedDiscountPct}%.
          </Alert>
        )}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Bảng giá</th>
                <th>Phạm vi</th>
                <th className="text-right">Mở cửa</th>
                <th className="text-right">/km</th>
                <th className="text-right">Tối thiểu</th>
                <th className="text-right">Xe ghép</th>
                <th>Cao điểm</th>
                <th>Đêm</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRows key={r.id} r={r} editing={editing === r.id} onToggle={() => setEditing(editing === r.id ? null : r.id)} defaults={defaults} zones={zones} busy={busy} onSave={(body) => run(() => api.updatePricingRule(token!, r.id, body))} onDelete={() => confirm(`Xoá bảng giá ${r.name}?`) && run(async () => { await api.deletePricingRule(token!, r.id); setEditing(null); })} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-5">
        <CardTitle description="Hệ số hiện tại từ số yêu cầu đang chờ so với tài xế đang trực, cache 60 giây. Tỷ lệ ≤ 0,5 là ×1; mỗi đơn vị tỷ lệ tăng thêm ×0,2, tới mức tối đa của bảng giá.">Giá giờ cao điểm hiện tại</CardTitle>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Khu vực</th>
                <th>Bảng giá</th>
                <th className="text-right">Yêu cầu chờ</th>
                <th className="text-right">Tài xế trực</th>
                <th className="text-right">Hệ số</th>
              </tr>
            </thead>
            <tbody>
              {surge.map((s) => (
                <tr key={s.zoneId ?? "all"}>
                  <td className="font-medium text-ink-900">{s.zoneName}</td>
                  <td className="text-ink-600">
                    {s.ruleName}
                    {!s.surgeEnabled && <span className="text-xs text-ink-400"> · tắt cao điểm</span>}
                  </td>
                  <td className="text-right tabular-nums">{s.openRequests}</td>
                  <td className="text-right tabular-nums">{s.availableDrivers}</td>
                  <td className="text-right">
                    <Badge tone={s.multiplier > 1.2 ? "amber" : s.multiplier > 1 ? "blue" : "green"}>×{s.multiplier}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle description="Mã áp dụng lên giá sau cao điểm và giảm xe ghép; mỗi chuyến một mã; huỷ chuyến trả lại lượt.">Mã khuyến mãi</CardTitle>
        <form
          className="rounded-2xl border border-dashed border-ink-200 p-4 mb-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.createPromotion(token!, {
                code: promo.code.trim().toUpperCase(),
                description: promo.description || undefined,
                type: promo.type,
                value: Number(promo.value),
                maxDiscount: promo.maxDiscount ? Number(promo.maxDiscount) : undefined,
                minFare: Number(promo.minFare) || 0,
                tripType: promo.tripType || undefined,
                perUserLimit: Number(promo.perUserLimit) || 1,
                usageLimit: promo.usageLimit ? Number(promo.usageLimit) : undefined,
                startsAt: promo.startsAt ? new Date(promo.startsAt).toISOString() : undefined,
                endsAt: promo.endsAt ? new Date(promo.endsAt).toISOString() : undefined,
                firstRideOnly: promo.firstRideOnly,
              });
              setPromo({ ...promo, code: "", description: "", maxDiscount: "", usageLimit: "" });
            });
          }}
        >
          <div className="grid sm:grid-cols-[1fr_2fr_1fr_1fr] gap-3">
            <Field label="Mã">
              <Input className="uppercase font-mono" placeholder="GHEPGO20" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} required pattern="[A-Z0-9_-]{3,32}" />
            </Field>
            <Field label="Mô tả">
              <Input placeholder="Giảm 20% cho khách mới" value={promo.description} onChange={(e) => setPromo({ ...promo, description: e.target.value })} />
            </Field>
            <Field label="Loại">
              <Select value={promo.type} onChange={(e) => setPromo({ ...promo, type: e.target.value })}>
                <option value="PERCENT">Phần trăm</option>
                <option value="FIXED">Số tiền</option>
              </Select>
            </Field>
            <Field label={promo.type === "PERCENT" ? "Giá trị (%)" : "Giá trị (đ)"}>
              <Input type="number" min={1} max={promo.type === "PERCENT" ? 100 : undefined} value={promo.value} onChange={(e) => setPromo({ ...promo, value: e.target.value })} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Field label="Giảm tối đa (đ)">
              <Input type="number" className="py-1.5" min={0} step={1000} value={promo.maxDiscount} onChange={(e) => setPromo({ ...promo, maxDiscount: e.target.value })} placeholder="không giới hạn" />
            </Field>
            <Field label="Đơn tối thiểu (đ)">
              <Input type="number" className="py-1.5" min={0} step={1000} value={promo.minFare} onChange={(e) => setPromo({ ...promo, minFare: e.target.value })} />
            </Field>
            <Field label="Loại chuyến">
              <Select className="py-1.5" value={promo.tripType} onChange={(e) => setPromo({ ...promo, tripType: e.target.value })}>
                <option value="">Mọi loại</option>
                <option value="PRIVATE">Bao xe</option>
                <option value="SHARED">Xe ghép</option>
              </Select>
            </Field>
            <Field label="Lượt / khách">
              <Input type="number" className="py-1.5" min={1} value={promo.perUserLimit} onChange={(e) => setPromo({ ...promo, perUserLimit: e.target.value })} />
            </Field>
            <Field label="Tổng lượt">
              <Input type="number" className="py-1.5" min={1} value={promo.usageLimit} onChange={(e) => setPromo({ ...promo, usageLimit: e.target.value })} placeholder="không giới hạn" />
            </Field>
            <Field label="Bắt đầu">
              <Input type="datetime-local" className="py-1.5" value={promo.startsAt} onChange={(e) => setPromo({ ...promo, startsAt: e.target.value })} />
            </Field>
            <Field label="Kết thúc">
              <Input type="datetime-local" className="py-1.5" value={promo.endsAt} onChange={(e) => setPromo({ ...promo, endsAt: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={promo.firstRideOnly} onChange={(e) => setPromo({ ...promo, firstRideOnly: e.target.checked })} /> Chỉ chuyến đầu tiên
            </label>
            <Button type="submit" loading={busy} className="ml-auto">
              Tạo mã
            </Button>
          </div>
        </form>

        {promos.length === 0 && <EmptyState icon={<Icon.star className="h-6 w-6" />} title="Chưa có mã khuyến mãi" />}
        {promos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Ưu đãi</th>
                  <th>Điều kiện</th>
                  <th>Hiệu lực</th>
                  <th className="text-right">Đã dùng</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const expired = p.endsAt && new Date(p.endsAt) < new Date();
                  const exhausted = p.usageLimit != null && p.usedCount >= p.usageLimit;
                  const tone: Tone = !p.isActive ? "slate" : expired || exhausted ? "red" : "green";
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="font-mono font-semibold text-ink-900">{p.code}</span>
                        {p.description && <span className="block text-xs text-ink-500">{p.description}</span>}
                      </td>
                      <td className="text-ink-800">
                        {p.type === "PERCENT" ? `${p.value}%` : vnd(p.value)}
                        {p.maxDiscount ? <span className="text-xs text-ink-500"> · tối đa {vnd(p.maxDiscount)}</span> : ""}
                      </td>
                      <td className="text-xs text-ink-500">
                        {p.minFare > 0 ? `đơn ≥ ${vnd(p.minFare)} · ` : ""}
                        {p.tripType ? (p.tripType === "SHARED" ? "xe ghép · " : "bao xe · ") : ""}
                        {p.firstRideOnly ? "chuyến đầu · " : ""}
                        {p.perUserLimit} lượt/khách
                        {p.usageLimit ? ` · tổng ${p.usageLimit}` : ""}
                      </td>
                      <td className="text-xs text-ink-500">
                        {p.startsAt ? new Date(p.startsAt).toLocaleDateString("vi-VN") : "—"} → {p.endsAt ? new Date(p.endsAt).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        <button className="link" onClick={() => run(async () => setRedemptions({ id: p.id, rows: await api.promotionRedemptions(token!, p.id) }))}>
                          {p.usedCount}
                        </button>
                      </td>
                      <td>
                        <Badge tone={tone}>{!p.isActive ? "Tắt" : expired ? "Hết hạn" : exhausted ? "Hết lượt" : "Đang chạy"}</Badge>
                      </td>
                      <td className="text-right">
                        <Button size="sm" variant={p.isActive ? "secondary" : "soft"} disabled={busy} onClick={() => run(() => api.updatePromotion(token!, p.id, { isActive: !p.isActive }))}>
                          {p.isActive ? "Tắt" : "Bật"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {redemptions && (
          <div className="mt-4 rounded-2xl bg-ink-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-ink-900">Lượt dùng mã {promos.find((p) => p.id === redemptions.id)?.code}</h3>
              <button className="text-xs text-ink-500 hover:text-ink-800" onClick={() => setRedemptions(null)}>
                Đóng
              </button>
            </div>
            {redemptions.rows.length === 0 && <p className="text-sm text-ink-500">Chưa có lượt dùng.</p>}
            <ul className="divide-y divide-ink-200/60 text-sm">
              {redemptions.rows.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-ink-900">{r.user.fullName}</span> <span className="text-xs text-ink-500">{r.user.phone}</span>
                    <span className="block text-xs text-ink-500 truncate">
                      {r.trip.pickupAddress} → {r.trip.dropoffAddress} · {r.trip.status}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-semibold text-emerald-700">−{vnd(r.amount)}</span>
                    <span className="text-[11px] text-ink-400">{new Date(r.createdAt).toLocaleString("vi-VN")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function RuleRows({ r, editing, onToggle, defaults, zones, busy, onSave, onDelete }: { r: any; editing: boolean; onToggle: () => void; defaults: any; zones: any[]; busy: boolean; onSave: (body: Record<string, unknown>) => void; onDelete: () => void }) {
  return (
    <>
      <tr>
        <td className="font-medium text-ink-900">{r.name}</td>
        <td>{r.zone ? <Badge tone="blue">{r.zone.name}</Badge> : <Badge tone="brand">Mặc định</Badge>}</td>
        <td className="text-right tabular-nums">{vnd(r.baseFare)}</td>
        <td className="text-right tabular-nums">{vnd(r.perKm)}</td>
        <td className="text-right tabular-nums">{vnd(r.minFare)}</td>
        <td className="text-right tabular-nums">−{r.sharedDiscountPct}%</td>
        <td className="text-ink-600 text-xs">{r.surgeEnabled ? `tới ×${r.surgeMax}` : "tắt"}</td>
        <td className="text-ink-600 text-xs">{r.nightSurchargePct > 0 ? `+${r.nightSurchargePct}% ${r.nightStartHour}h–${r.nightEndHour}h` : "—"}</td>
        <td>
          <Badge tone={r.isActive ? "green" : "slate"} dot>
            {r.isActive ? "Đang áp dụng" : "Tạm dừng"}
          </Badge>
        </td>
        <td className="text-right">
          <button className="link text-sm" onClick={onToggle}>
            {editing ? "Đóng" : "Sửa"}
          </button>
        </td>
      </tr>
      {editing && defaults && (
        <tr>
          <td colSpan={10} className="bg-ink-50/60 p-4">
            <RuleEditor rule={r} defaults={defaults} zones={zones} busy={busy} onSave={onSave} onDelete={onDelete} />
          </td>
        </tr>
      )}
    </>
  );
}
