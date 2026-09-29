"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { CATEGORY_LABEL, COMPLAINT_STATUS, ComplaintThread } from "@/components/complaint-thread";

export default function AdminComplaintsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.adminComplaints(token, status || undefined).then(setItems).catch(() => {});
  }, [token, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Khiếu nại ({items.length})</h1>
        <select className="border rounded px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả</option>
          <option value="OPEN">Mới</option>
          <option value="IN_REVIEW">Đang xử lý</option>
          <option value="RESOLVED">Đã giải quyết</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </div>
      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <div className="bg-white rounded-lg border divide-y max-h-[70vh] overflow-auto">
          {items.length === 0 && <p className="p-4 text-sm text-slate-500">Không có khiếu nại.</p>}
          {items.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 text-sm hover:bg-slate-50 ${selected === c.id ? "bg-slate-50" : ""}`}>
              <div className="flex justify-between gap-2">
                <span className="font-medium">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${COMPLAINT_STATUS[c.status]?.cls}`}>{COMPLAINT_STATUS[c.status]?.label}</span>
              </div>
              <p className="text-slate-600 truncate">{c.trip.pickupAddress} → {c.trip.dropoffAddress}</p>
              <p className="text-xs text-slate-400">
                {c.reporter.fullName} ({c.reporter.role === "DRIVER" ? "tài xế" : "khách"}) · {c.reporter.phone}
                {c.againstUser ? ` → ${c.againstUser.fullName}` : ""} · {new Date(c.createdAt).toLocaleString("vi-VN")}
              </p>
            </button>
          ))}
        </div>
        <div className="bg-white rounded-lg border p-4">
          {selected ? <ComplaintThread id={selected} onChanged={load} /> : <p className="text-sm text-slate-500">Chọn một khiếu nại để xử lý.</p>}
        </div>
      </div>
    </div>
  );
}
