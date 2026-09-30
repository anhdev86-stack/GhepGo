"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { ComplaintRow, ComplaintThread } from "@/components/complaint-thread";
import { Card, EmptyState, PageHeader, Select } from "@/components/ui";

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
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title={`Khiếu nại (${items.length})`}
        description="Trả lời, kết luận và hoàn tiền ngay trong luồng trao đổi."
        action={
          <Select className="py-1.5 w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="OPEN">Mới</option>
            <option value="IN_REVIEW">Đang xử lý</option>
            <option value="RESOLVED">Đã giải quyết</option>
            <option value="REJECTED">Từ chối</option>
          </Select>
        }
      />
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 items-start">
        <Card padded={false} className="divide-y divide-ink-100 overflow-hidden max-h-[75vh] overflow-y-auto">
          {items.length === 0 && <EmptyState title="Không có khiếu nại" />}
          {items.map((c) => (
            <ComplaintRow
              key={c.id}
              c={c}
              selected={selected === c.id}
              onSelect={() => setSelected(c.id)}
              subtitle={`${c.reporter.fullName} (${c.reporter.role === "DRIVER" ? "tài xế" : "khách"}) · ${c.reporter.phone}${c.againstUser ? ` → ${c.againstUser.fullName}` : ""} · ${new Date(c.createdAt).toLocaleString("vi-VN")}`}
            />
          ))}
        </Card>
        <Card>{selected ? <ComplaintThread id={selected} onChanged={load} /> : <EmptyState title="Chọn một khiếu nại để xử lý" />}</Card>
      </div>
    </div>
  );
}
