"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { Alert, Avatar, Badge, Button, Field, Input, RouteLine, Select, Spinner, Textarea, type Tone } from "@/components/ui";
import { PRIORITY, PriorityBadge, SlaBadge } from "@/components/complaint-sla";

export const COMPLAINT_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Mới", tone: "amber" },
  IN_REVIEW: { label: "Đang xử lý", tone: "blue" },
  RESOLVED: { label: "Đã giải quyết", tone: "green" },
  REJECTED: { label: "Từ chối", tone: "slate" },
};
export const CATEGORY_LABEL: Record<string, string> = {
  DRIVER_BEHAVIOR: "Thái độ tài xế",
  CUSTOMER_BEHAVIOR: "Thái độ khách hàng",
  ROUTE: "Lộ trình / đi vòng",
  FARE: "Giá cước",
  SAFETY: "An toàn",
  LOST_ITEM: "Quên đồ",
  PAYMENT: "Thanh toán",
  OTHER: "Khác",
};
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

/** Complaint detail + message thread; admins get the resolve panel. */
export function ComplaintThread({ id, onChanged, staff = [] }: { id: string; onChanged?: () => void; staff?: { id: string; fullName: string; active: number }[] }) {
  const { token, user } = useAuth();
  const [c, setC] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [resolution, setResolution] = useState("");
  const [refund, setRefund] = useState("0");
  const [chargeDriver, setChargeDriver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api.complaint(token, id).then(setC).catch(() => {});
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!c)
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500 py-8 justify-center">
        <Spinner className="h-4 w-4" /> Đang tải…
      </div>
    );
  const closed = ["RESOLVED", "REJECTED"].includes(c.status);
  const st = COMPLAINT_STATUS[c.status] ?? { label: c.status, tone: "slate" as Tone };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink-900 text-lg">{CATEGORY_LABEL[c.category] ?? c.category}</p>
          <p className="text-xs text-ink-500 mt-0.5">
            {c.reporter.fullName} ({c.reporter.role === "DRIVER" ? "tài xế" : "khách"}) khiếu nại
            {c.againstUser ? ` ${c.againstUser.fullName}` : ""} · {new Date(c.createdAt).toLocaleString("vi-VN")}
          </p>
        </div>
        <span className="flex flex-col items-end gap-1.5">
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          <span className="flex items-center gap-1.5">
            <PriorityBadge priority={c.priority} />
            <SlaBadge c={c} />
          </span>
        </span>
      </div>

      {user?.role === "ADMIN" && !closed && (
        <div className="grid sm:grid-cols-2 gap-3 rounded-xl bg-ink-50 p-3">
          <Field label="Người xử lý">
            <Select className="py-1.5 text-sm bg-white" value={c.assignee?.id ?? ""} disabled={busy} onChange={(e) => run(() => api.assignComplaint(token!, id, e.target.value || null))}>
              <option value="">— chưa phân công —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.id === user.id ? " (bạn)" : ""} · {s.active} đang mở
                </option>
              ))}
              {c.assignee && !staff.some((s) => s.id === c.assignee.id) && <option value={c.assignee.id}>{c.assignee.fullName}</option>}
            </Select>
          </Field>
          <Field label="Ưu tiên" hint={c.assignedAt ? `Phân công ${new Date(c.assignedAt).toLocaleString("vi-VN")}` : undefined}>
            <Select className="py-1.5 text-sm bg-white" value={c.priority} disabled={busy} onChange={(e) => run(() => api.setComplaintPriority(token!, id, e.target.value))}>
              {Object.entries(PRIORITY)
                .sort((a, b) => b[1].rank - a[1].rank)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="sm:col-span-2 text-xs text-ink-500">
            Phản hồi đầu tiên trước <b className="text-ink-700">{new Date(c.firstResponseDueAt).toLocaleString("vi-VN")}</b>
            {c.firstResponseAt ? ` (đã phản hồi ${new Date(c.firstResponseAt).toLocaleString("vi-VN")})` : ""} · giải quyết trước <b className="text-ink-700">{new Date(c.dueAt).toLocaleString("vi-VN")}</b>.
          </p>
        </div>
      )}
      {user?.role !== "ADMIN" && !closed && (
        <p className="text-xs text-ink-500">
          {c.assignee ? `Nhân viên ${c.assignee.fullName} đang phụ trách. ` : ""}
          {c.firstResponseAt ? "GhepGo đã phản hồi; " : "GhepGo sẽ phản hồi "}
          {c.firstResponseAt ? "dự kiến giải quyết trước" : "trước"} {new Date(c.firstResponseAt ? c.dueAt : c.firstResponseDueAt).toLocaleString("vi-VN")}.
        </p>
      )}

      <div className="rounded-xl border border-ink-200/70 p-3">
        <RouteLine pickup={c.trip.pickupAddress} dropoff={c.trip.dropoffAddress} />
        <p className="text-xs text-ink-500 mt-2 pl-6">Giá cước {vnd(c.trip.fare)}</p>
      </div>

      <p className="text-sm bg-ink-50 rounded-xl p-3 whitespace-pre-wrap text-ink-800">{c.description}</p>
      {c.refundAmount && <Alert tone="green">Đã hoàn {vnd(c.refundAmount)} vào ví khách.</Alert>}

      <ul className="flex flex-col gap-2.5">
        {c.messages.map((m: any) => {
          const mine = m.author.id === user?.id;
          const isAdmin = m.author.role === "ADMIN";
          return (
            <li key={m.id} className={`flex gap-2 max-w-[88%] ${mine ? "self-end flex-row-reverse" : "self-start"}`}>
              {!mine && <Avatar name={isAdmin ? "GhepGo" : m.author.fullName} size={28} className={isAdmin ? "bg-ink-900 text-white" : ""} />}
              <div className={`rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-brand-600 text-white rounded-tr-sm" : isAdmin ? "bg-amber-50 border border-amber-200 text-ink-900 rounded-tl-sm" : "bg-ink-100 text-ink-900 rounded-tl-sm"}`}>
                <p className={`text-[11px] mb-0.5 ${mine ? "text-white/70" : "text-ink-500"}`}>
                  {m.author.fullName}
                  {isAdmin ? " · GhepGo" : ""} · {new Date(m.createdAt).toLocaleString("vi-VN")}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <Alert>{error}</Alert>}

      {!closed && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!msg.trim()) return;
            run(async () => {
              await api.complaintMessage(token!, id, msg.trim());
              setMsg("");
            });
          }}
        >
          <Input placeholder="Nhập tin nhắn…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button type="submit" loading={busy}>
            Gửi
          </Button>
        </form>
      )}

      {user?.role === "ADMIN" && !closed && (
        <div className="border-t border-ink-100 pt-4 flex flex-col gap-3 text-sm">
          <p className="font-semibold text-ink-900">Xử lý khiếu nại</p>
          <Textarea rows={2} placeholder="Kết luận gửi cho hai bên" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Hoàn cho khách (đ)">
              <Input type="number" className="w-36 py-1.5" min={0} max={Number(c.trip.fare)} step={1000} value={refund} onChange={(e) => setRefund(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 pb-2.5 text-ink-700">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={chargeDriver} onChange={(e) => setChargeDriver(e.target.checked)} /> Trừ ví tài xế
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status === "OPEN" && (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "IN_REVIEW" }))}>
                Nhận xử lý
              </Button>
            )}
            <Button disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "RESOLVED", resolution: resolution || undefined, refundAmount: Number(refund) || 0, chargeDriver }))}>
              Giải quyết
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "REJECTED", resolution: resolution || undefined }))}>
              Từ chối
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared list row for the complaint inboxes. */
export function ComplaintRow({ c, selected, onSelect, subtitle, extra }: { c: any; selected: boolean; onSelect: () => void; subtitle: string; extra?: React.ReactNode }) {
  const st = COMPLAINT_STATUS[c.status] ?? { label: c.status, tone: "slate" as Tone };
  const overdue = c.sla?.overdue;
  return (
    <button onClick={onSelect} className={`relative w-full text-left px-4 py-3 text-sm transition ${selected ? "bg-brand-50/70" : "hover:bg-ink-50"}`}>
      {overdue && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-red-500" aria-hidden />}
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-ink-900">{CATEGORY_LABEL[c.category] ?? c.category}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="text-ink-600 truncate mt-0.5">
        {c.trip.pickupAddress} → {c.trip.dropoffAddress}
      </p>
      <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>
      {extra && <div className="mt-1.5">{extra}</div>}
    </button>
  );
}
