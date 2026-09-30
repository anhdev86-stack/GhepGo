"use client";

import { Badge, type Tone } from "@/components/ui";

export const PRIORITY: Record<string, { label: string; tone: Tone; rank: number }> = {
  URGENT: { label: "Khẩn cấp", tone: "red", rank: 3 },
  HIGH: { label: "Cao", tone: "amber", rank: 2 },
  NORMAL: { label: "Bình thường", tone: "slate", rank: 1 },
  LOW: { label: "Thấp", tone: "slate", rank: 0 },
};

/** "còn 2 giờ 10 phút" / "quá hạn 35 phút", computed client-side so it stays fresh between fetches. */
export function remaining(due: string | Date, now = Date.now()) {
  const diffMin = Math.round((new Date(due).getTime() - now) / 60_000);
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h >= 48 ? `${Math.floor(h / 24)} ngày` : h > 0 ? `${h} giờ${m && h < 6 ? ` ${m} phút` : ""}` : `${m} phút`;
  return { overdue: diffMin < 0, text: diffMin < 0 ? `quá hạn ${span}` : `còn ${span}`, minutes: diffMin };
}

export function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.NORMAL;
  return (
    <Badge tone={p.tone} dot={priority === "URGENT"}>
      {p.label}
    </Badge>
  );
}

/**
 * One-line SLA state for a complaint: which clock is running (first response
 * or resolution), how much is left, or whether the closed case met its SLA.
 */
export function SlaBadge({ c, now, compact = false }: { c: any; now?: number; compact?: boolean }) {
  const active = ["OPEN", "IN_REVIEW"].includes(c.status);
  if (!active) {
    const met = c.sla?.resolution?.met;
    if (met == null) return null;
    return <Badge tone={met ? "green" : "red"}>{met ? "Đúng hạn SLA" : "Trễ SLA"}</Badge>;
  }
  const waitingFirst = !c.firstResponseAt;
  const r = remaining(waitingFirst ? c.firstResponseDueAt : c.dueAt, now);
  const tone: Tone = r.overdue ? "red" : r.minutes < 60 ? "amber" : waitingFirst ? "blue" : "slate";
  return (
    <Badge tone={tone} dot={r.overdue}>
      {compact ? r.text : `${waitingFirst ? "Phản hồi" : "Giải quyết"} ${r.text}`}
    </Badge>
  );
}
