"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { CATEGORY_LABEL, ComplaintRow, ComplaintThread } from "@/components/complaint-thread";
import { Alert, Button, Card, CardTitle, EmptyState, Field, Icon, PageHeader, Select, Textarea } from "@/components/ui";

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
    <div>
      <PageHeader title="Khiếu nại & hỗ trợ" description="Báo cáo sự cố về một chuyến đi; đội hỗ trợ GhepGo sẽ phản hồi trong luồng trao đổi." />

      {tripId && (
        <Card className="mb-5 border-brand-200">
          <CardTitle description="Mô tả càng cụ thể, chúng tôi xử lý càng nhanh.">Gửi khiếu nại cho chuyến đi</CardTitle>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Loại sự cố">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(categories.length ? categories : Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })))
                  .filter((c) => (user?.role === "DRIVER" ? c.value !== "DRIVER_BEHAVIOR" : c.value !== "CUSTOMER_BEHAVIOR"))
                  .map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Mô tả sự việc">
              <Textarea rows={4} minLength={10} required placeholder="Ít nhất 10 ký tự" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                Gửi khiếu nại
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.replace("/complaints")}>
                Huỷ
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 items-start">
        <Card padded={false} className="divide-y divide-ink-100 overflow-hidden">
          {items.length === 0 && <EmptyState icon={<Icon.shield className="h-6 w-6" />} title="Chưa có khiếu nại nào" description="Bạn có thể báo cáo sự cố từ lịch sử chuyến đi." />}
          {items.map((c) => (
            <ComplaintRow
              key={c.id}
              c={c}
              selected={selected === c.id}
              onSelect={() => setSelected(c.id)}
              subtitle={`${c.reporter.id !== user?.id ? `${c.reporter.fullName} khiếu nại về bạn · ` : ""}${new Date(c.createdAt).toLocaleDateString("vi-VN")} · ${c._count.messages} tin nhắn`}
            />
          ))}
        </Card>
        <Card>{selected ? <ComplaintThread id={selected} onChanged={load} /> : <EmptyState title="Chọn một khiếu nại để xem" description="Luồng trao đổi với đội hỗ trợ hiện ở đây." />}</Card>
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
