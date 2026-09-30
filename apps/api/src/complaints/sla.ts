/**
 * Complaint SLA policy.
 *
 *  - Each priority has two clocks (minutes): first admin response and
 *    resolution. Defaults below; override per priority with
 *    COMPLAINT_SLA_<PRIORITY>="firstResponseMin,resolveMin".
 *  - Category → default priority (SAFETY is always urgent).
 */
export type ComplaintPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const PRIORITIES: ComplaintPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export interface SlaClock {
  firstResponseMin: number;
  resolveMin: number;
}

const DEFAULT_SLA: Record<ComplaintPriority, SlaClock> = {
  URGENT: { firstResponseMin: 15, resolveMin: 4 * 60 },
  HIGH: { firstResponseMin: 60, resolveMin: 24 * 60 },
  NORMAL: { firstResponseMin: 4 * 60, resolveMin: 48 * 60 },
  LOW: { firstResponseMin: 24 * 60, resolveMin: 72 * 60 },
};

const CATEGORY_PRIORITY: Record<string, ComplaintPriority> = {
  SAFETY: 'URGENT',
  PAYMENT: 'HIGH',
  LOST_ITEM: 'HIGH',
  FARE: 'NORMAL',
  ROUTE: 'NORMAL',
  DRIVER_BEHAVIOR: 'NORMAL',
  CUSTOMER_BEHAVIOR: 'NORMAL',
  OTHER: 'LOW',
};

export const PRIORITY_LABEL: Record<ComplaintPriority, string> = {
  URGENT: 'Khẩn cấp',
  HIGH: 'Cao',
  NORMAL: 'Bình thường',
  LOW: 'Thấp',
};

export function loadSlaPolicy(env: Record<string, string | undefined> = process.env): Record<ComplaintPriority, SlaClock> {
  const policy = { ...DEFAULT_SLA };
  for (const p of PRIORITIES) {
    const raw = env[`COMPLAINT_SLA_${p}`];
    if (!raw) continue;
    const [a, b] = raw.split(',').map((x) => Number(x.trim()));
    if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) policy[p] = { firstResponseMin: a, resolveMin: b };
  }
  return policy;
}

export function defaultPriority(category: string): ComplaintPriority {
  return CATEGORY_PRIORITY[category] ?? 'NORMAL';
}

/** Deadlines for a complaint created at `createdAt` under `priority`. */
export function deadlines(policy: Record<ComplaintPriority, SlaClock>, priority: ComplaintPriority, createdAt: Date) {
  const clock = policy[priority];
  return {
    firstResponseDueAt: new Date(createdAt.getTime() + clock.firstResponseMin * 60_000),
    dueAt: new Date(createdAt.getTime() + clock.resolveMin * 60_000),
  };
}

/** Human-readable remaining time: "còn 2 giờ 10 phút" / "quá hạn 35 phút". */
export function describeRemaining(due: Date, now = new Date()): { overdue: boolean; text: string; minutes: number } {
  const diffMin = Math.round((due.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h > 0 ? `${h} giờ${m ? ` ${m} phút` : ''}` : `${m} phút`;
  return diffMin >= 0 ? { overdue: false, text: `còn ${span}`, minutes: diffMin } : { overdue: true, text: `quá hạn ${span}`, minutes: diffMin };
}
