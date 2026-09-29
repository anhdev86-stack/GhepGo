"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";

export const COMPLAINT_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Mới", cls: "bg-orange-100 text-orange-700" },
  IN_REVIEW: { label: "Đang xử lý", cls: "bg-blue-100 text-blue-700" },
  RESOLVED: { label: "Đã giải quyết", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Từ chối", cls: "bg-slate-200 text-slate-600" },
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
export function ComplaintThread({ id, onChanged }: { id: string; onChanged?: () => void }) {
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

  if (!c) return <p className="text-sm text-slate-500">Đang tải...</p>;
  const closed = ["RESOLVED", "REJECTED"].includes(c.status);

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
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-medium">{CATEGORY_LABEL[c.category] ?? c.category}</p>
          <p className="text-sm text-slate-600">
            {c.trip.pickupAddress} → {c.trip.dropoffAddress} · {vnd(c.trip.fare)}
          </p>
          <p className="text-xs text-slate-500">
            {c.reporter.fullName} ({c.reporter.role === "DRIVER" ? "tài xế" : "khách"}) khiếu nại
            {c.againstUser ? ` ${c.againstUser.fullName}` : ""} · {new Date(c.createdAt).toLocaleString("vi-VN")}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${COMPLAINT_STATUS[c.status]?.cls}`}>
          {COMPLAINT_STATUS[c.status]?.label ?? c.status}
        </span>
      </div>
      <p className="text-sm bg-slate-50 rounded p-2 whitespace-pre-wrap">{c.description}</p>
      {c.refundAmount && <p className="text-sm text-green-700">Đã hoàn {vnd(c.refundAmount)} vào ví khách.</p>}

      <ul className="flex flex-col gap-2">
        {c.messages.map((m: any) => {
          const mine = m.author.id === user?.id;
          return (
            <li key={m.id} className={`text-sm max-w-[85%] rounded-lg px-3 py-2 ${mine ? "self-end bg-blue-600 text-white" : m.author.role === "ADMIN" ? "self-start bg-yellow-50 border border-yellow-200" : "self-start bg-slate-100"}`}>
              <p className={`text-[11px] ${mine ? "text-blue-100" : "text-slate-500"}`}>
                {m.author.fullName}{m.author.role === "ADMIN" ? " · GhepGo" : ""} · {new Date(m.createdAt).toLocaleString("vi-VN")}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-red-600 text-sm">{error}</p>}

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
          <input className="border rounded px-3 py-2 flex-1 text-sm" placeholder="Nhập tin nhắn..." value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button disabled={busy} className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50">Gửi</button>
        </form>
      )}

      {user?.role === "ADMIN" && !closed && (
        <div className="border-t pt-3 flex flex-col gap-2 text-sm">
          <p className="font-medium">Xử lý khiếu nại</p>
          <textarea className="border rounded px-3 py-2" rows={2} placeholder="Kết luận gửi cho hai bên" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-1">
              Hoàn cho khách
              <input type="number" className="border rounded px-2 py-1 w-28" min={0} max={Number(c.trip.fare)} step={1000} value={refund} onChange={(e) => setRefund(e.target.value)} />
              đ
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={chargeDriver} onChange={(e) => setChargeDriver(e.target.checked)} /> trừ ví tài xế
            </label>
          </div>
          <div className="flex gap-2">
            {c.status === "OPEN" && (
              <button disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "IN_REVIEW" }))} className="border rounded px-3 py-1.5">Nhận xử lý</button>
            )}
            <button disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "RESOLVED", resolution: resolution || undefined, refundAmount: Number(refund) || 0, chargeDriver }))} className="bg-green-600 text-white rounded px-3 py-1.5">Giải quyết</button>
            <button disabled={busy} onClick={() => run(() => api.resolveComplaint(token!, id, { status: "REJECTED", resolution: resolution || undefined }))} className="bg-slate-500 text-white rounded px-3 py-1.5">Từ chối</button>
          </div>
        </div>
      )}
    </div>
  );
}
