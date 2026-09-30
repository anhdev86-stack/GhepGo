"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { useNow, useRealtime, useSocketEvent, WS } from "@/lib/realtime";
import { ComplaintRow, ComplaintThread } from "@/components/complaint-thread";
import { PRIORITY, PriorityBadge, SlaBadge } from "@/components/complaint-sla";
import { Avatar, Card, EmptyState, Icon, PageHeader, Select, Stat } from "@/components/ui";

type Tab = "all" | "mine" | "unassigned" | "overdue";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "mine", label: "Của tôi" },
  { key: "unassigned", label: "Chưa phân công" },
  { key: "overdue", label: "Quá hạn" },
];

export default function AdminComplaintsPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const { socket } = useRealtime(token);
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<string>("ACTIVE");
  const [priority, setPriority] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [sla, setSla] = useState<any | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api
      .adminComplaints(token, {
        status: tab === "overdue" ? undefined : status || undefined,
        assignee: tab === "mine" ? "me" : tab === "unassigned" ? "unassigned" : undefined,
        priority: priority || undefined,
        overdue: tab === "overdue",
      })
      .then(setItems)
      .catch(() => {});
    api.complaintStaff(token).then(setStaff).catch(() => {});
    api.complaintSla(token).then(setSla).catch(() => {});
  }, [token, tab, status, priority]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);
  // New complaints and SLA alerts arrive as notifications; refresh the inbox on each.
  useSocketEvent(socket, WS.NOTIFICATION, load);

  const counts = useMemo(() => {
    const byPriority: Record<string, number> = {};
    for (const c of items) byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;
    return byPriority;
  }, [items]);

  if (!isLoading && (!user || user.role !== "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const backlog = sla?.backlog;

  return (
    <div>
      <PageHeader eyebrow="Quản trị" title="Khiếu nại" description="Mỗi khiếu nại có người xử lý và hai mốc SLA: phản hồi đầu tiên và giải quyết. Quá hạn sẽ được nhắc và leo thang tự động." />

      {sla && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Stat label="Đang mở" value={backlog.open} hint={`${backlog.unassigned} chưa phân công`} icon={<Icon.inbox className="h-5 w-5" />} tone="blue" />
          <Stat label="Quá hạn SLA" value={backlog.overdue} icon={<Icon.alert className="h-5 w-5" />} tone={backlog.overdue > 0 ? "red" : "green"} />
          <Stat label="Phản hồi đúng hạn (30 ngày)" value={sla.firstResponseWithinSlaPct != null ? `${sla.firstResponseWithinSlaPct}%` : "—"} hint={sla.avgFirstResponseMin != null ? `TB ${fmtMin(sla.avgFirstResponseMin)}` : undefined} icon={<Icon.clock className="h-5 w-5" />} tone="brand" />
          <Stat label="Giải quyết đúng hạn (30 ngày)" value={sla.resolvedWithinSlaPct != null ? `${sla.resolvedWithinSlaPct}%` : "—"} hint={sla.avgResolveMin != null ? `TB ${fmtMin(sla.avgResolveMin)}` : undefined} icon={<Icon.check className="h-5 w-5" />} tone="green" />
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 items-start">
        <div className="flex flex-col gap-3">
          <Card padded={false} className="overflow-hidden">
            <div className="px-3 pt-3 flex flex-wrap items-center gap-1 border-b border-ink-100 pb-2">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.key ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100"}`}>
                  {t.label}
                  {t.key === "overdue" && backlog?.overdue > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{backlog.overdue}</span>}
                  {t.key === "unassigned" && backlog?.unassigned > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{backlog.unassigned}</span>}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 flex gap-2 border-b border-ink-100 bg-ink-50/50">
              <Select className="py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} disabled={tab === "overdue"}>
                <option value="ACTIVE">Đang mở</option>
                <option value="">Mọi trạng thái</option>
                <option value="OPEN">Mới</option>
                <option value="IN_REVIEW">Đang xử lý</option>
                <option value="RESOLVED">Đã giải quyết</option>
                <option value="REJECTED">Từ chối</option>
              </Select>
              <Select className="py-1.5 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">Mọi ưu tiên</option>
                {Object.entries(PRIORITY)
                  .sort((a, b) => b[1].rank - a[1].rank)
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                      {counts[k] ? ` (${counts[k]})` : ""}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="divide-y divide-ink-100 max-h-[70vh] overflow-y-auto">
              {items.length === 0 && <EmptyState icon={<Icon.check className="h-6 w-6" />} title={tab === "overdue" ? "Không có khiếu nại quá hạn" : "Không có khiếu nại"} />}
              {items.map((c) => (
                <ComplaintRow
                  key={c.id}
                  c={c}
                  selected={selected === c.id}
                  onSelect={() => setSelected(c.id)}
                  subtitle={`${c.reporter.fullName} (${c.reporter.role === "DRIVER" ? "tài xế" : "khách"})${c.againstUser ? ` → ${c.againstUser.fullName}` : ""} · ${new Date(c.createdAt).toLocaleString("vi-VN")}`}
                  extra={
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <PriorityBadge priority={c.priority} />
                      <SlaBadge c={c} now={now} compact />
                      {c.assignee ? (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-500" title={c.assignee.fullName}>
                          <Avatar name={c.assignee.fullName} size={18} />
                          {c.assignee.id === user?.id ? "bạn" : c.assignee.fullName.split(" ").slice(-1)[0]}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">chưa phân công</span>
                      )}
                    </span>
                  }
                />
              ))}
            </div>
          </Card>

          {staff.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-ink-900 mb-2">Tải của đội xử lý</h3>
              <ul className="divide-y divide-ink-100 text-sm">
                {staff.map((s) => (
                  <li key={s.id} className="py-2 flex items-center gap-3">
                    <Avatar name={s.fullName} size={28} />
                    <span className="flex-1 min-w-0 truncate text-ink-800">
                      {s.fullName}
                      {s.id === user?.id ? " (bạn)" : ""}
                    </span>
                    <span className="text-xs text-ink-500">{s.active} đang mở</span>
                    {s.overdue > 0 && <span className="text-xs font-medium text-red-600">{s.overdue} quá hạn</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card>{selected ? <ComplaintThread id={selected} onChanged={load} staff={staff} /> : <EmptyState title="Chọn một khiếu nại để xử lý" description="Phân công, đặt ưu tiên, trao đổi và kết luận ngay tại đây." />}</Card>
      </div>
    </div>
  );
}

function fmtMin(min: number) {
  if (min < 60) return `${min} phút`;
  if (min < 48 * 60) return `${Math.round(min / 6) / 10} giờ`;
  return `${Math.round(min / 144) / 10} ngày`;
}
