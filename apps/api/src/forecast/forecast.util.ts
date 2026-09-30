/**
 * Pure helpers for demand forecasting. Everything here is deterministic and
 * unit-tested; the service only adds SQL and Redis around it.
 *
 * Model: seasonal profile by hour-of-week (7 × 24 slots), estimated as an
 * exponentially weighted mean over the last N weeks (recent weeks count
 * more). Good enough for a young marketplace with sparse data and no
 * dependency on ML libraries; swap `weightedMean` for something richer
 * once there is a year of history.
 */

export const HOURS_PER_WEEK = 7 * 24;
/** Bin size for pickup hotspots (~1.1 km at Vietnam's latitude). */
export const CELL_DEG = 0.01;
/** Weight applied to each successive week back in time (0.7 → 8 weeks ago weighs 6%). */
export const WEEK_DECAY = 0.7;

export interface Slot {
  /** 0 = Sunday … 6 = Saturday, in the forecast time zone. */
  dow: number;
  /** 0 … 23 in the forecast time zone. */
  hour: number;
}

export const slotIndex = (s: Slot) => s.dow * 24 + s.hour;

/** Day-of-week / hour of `date` in an IANA time zone (no library: Intl only). */
export function slotOf(date: Date, timeZone: string): Slot {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return { dow: dow < 0 ? 0 : dow, hour };
}

export const SLOT_LABEL_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Exponentially weighted mean of per-week counts; missing weeks count as 0 so a quiet slot stays quiet. */
export function weightedMean(countsByWeekAgo: Map<number, number>, weeks: number, decay = WEEK_DECAY): number {
  let num = 0;
  let den = 0;
  for (let k = 1; k <= weeks; k++) {
    const w = decay ** (k - 1);
    num += w * (countsByWeekAgo.get(k) ?? 0);
    den += w;
  }
  return den ? num / den : 0;
}

/** Bin a coordinate into a CELL_DEG grid; the key is stable and the center is the bin midpoint. */
export function cellOf(lat: number, lng: number, size = CELL_DEG) {
  const row = Math.floor(lat / size);
  const col = Math.floor(lng / size);
  return { key: `${row}:${col}`, lat: (row + 0.5) * size, lng: (col + 0.5) * size };
}

/**
 * Spread a shift over hour-of-week slots as fractional hours. A shift from
 * 07:30 to 09:15 adds 0.5 h to the 07 slot, 1 h to 08 and 0.25 h to 09.
 */
export function shiftHoursBySlot(startedAt: Date, endedAt: Date, timeZone: string, into = new Float64Array(HOURS_PER_WEEK)) {
  const HOUR = 3600_000;
  let cursor = startedAt.getTime();
  const end = Math.min(endedAt.getTime(), startedAt.getTime() + 24 * HOUR); // cap runaway shifts at 24 h
  while (cursor < end) {
    const nextHour = Math.floor(cursor / HOUR + 1) * HOUR;
    const chunkEnd = Math.min(nextHour, end);
    const slot = slotOf(new Date(cursor), timeZone);
    into[slotIndex(slot)] += (chunkEnd - cursor) / HOUR;
    cursor = chunkEnd;
  }
  return into;
}

/** Hour-aligned timestamps for the next `horizon` hours starting from the current hour. */
export function nextHours(from: Date, horizon: number): Date[] {
  const start = new Date(from);
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: horizon }, (_, i) => new Date(start.getTime() + i * 3600_000));
}

/** Confidence label from how many weeks actually contained data for a slot family. */
export function confidenceFor(weeksWithData: number): 'low' | 'medium' | 'high' {
  if (weeksWithData >= 6) return 'high';
  if (weeksWithData >= 3) return 'medium';
  return 'low';
}
