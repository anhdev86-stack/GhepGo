"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { CATEGORY_LABEL, COMPLAINT_STATUS, ComplaintThread } from "@/components/complaint-thread";

function ComplaintsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const tripId = params.get("tripId");
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("id"));
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api.myComplaints(token).then(setItems).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
    if (token) api.complaintCategories(token).then(setCategories).catch(() => {});
  }, [load, token]);

  if (!isLoading && (!user || user.role === "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tripId) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.createComplaint(token, { tripId, category, description });
      setDescription("");
      router.replace(`/complaints?id=${c.id}`);
      setSelected(c.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Khiếu nại & hỗ trợ</h1>

      {tripId && (
        <form onSubmit={submit} className="bg-white p-4 rounded-lg border flex flex-col gap-2">
          <h2 className="font-medium">Gửi khiếu nại cho chuyến đi</h2>
          <select className="border rounded px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            {(categories.length ? categories : Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })))
              .filter((c) => (user?.role === "DRIVER" ? c.value !== "DRIVER_BEHAVIOR" : c.value !== "CUSTOMER_BEHAVIOR"))
              .map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
          </select>
          <textarea className="border rounded px-3 py-2" rows={4} minLength={10} required placeholder="Mô tả sự việc (ít nhất 10 ký tự)" value={description} onChange={(e) => setDescription(e.target.value)} />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50">Gửi khiếu nại</button>
            <button type="button" onClick={() => router.replace("/complaints")} className="text-sm text-slate-500 underline">Huỷ</button>
          </div>
        </form>
      )}

      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <div className="bg-white rounded-lg border divide-y">
          {items.length === 0 && <p className="p-4 text-sm text-slate-500">Chưa có khiếu nại nào.</p>}
          {items.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 text-sm hover:bg-slate-50 ${selected === c.id ? "bg-slate-50" : ""}`}>
              <div className="flex justify-between gap-2">
                <span className="font-medium">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${COMPLAINT_STATUS[c.status]?.cls}`}>{COMPLAINT_STATUS[c.status]?.label}</span>
              </div>
              <p className="text-slate-600 truncate">{c.trip.pickupAddress} → {c.trip.dropoffAddress}</p>
              <p className="text-xs text-slate-400">
                {c.reporter.id !== user?.id ? `${c.reporter.fullName} khiếu nại về bạn · ` : ""}
                {new Date(c.createdAt).toLocaleDateString("vi-VN")} · {c._count.messages} tin nhắn
              </p>
            </button>
          ))}
        </div>
        <div className="bg-white rounded-lg border p-4">
          {selected ? <ComplaintThread id={selected} onChanged={load} /> : <p className="text-sm text-slate-500">Chọn một khiếu nại để xem.</p>}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ComplaintsPage />
    </Suspense>
  );
}
