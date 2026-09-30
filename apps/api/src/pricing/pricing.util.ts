/**
 * Pure fare arithmetic. The service supplies the rule, live surge and promo;
 * everything here is deterministic and unit-tested.
 *
 * Order of operations (what the customer sees on the receipt):
 *   base + distance + time
 *   → night surcharge (% of the above, when the pickup hour is in the night window)
 *   → surge multiplier (live supply/demand, capped by the rule)
 *   → shared-ride discount (SHARED only)
 *   → minimum fare
 *   → promotion discount (never below 0)
 *   → rounding to `roundTo`
 */

export interface FareRule {
  baseFare: number;
  perKm: number;
  perMinute: number;
  minFare: number;
  roundTo: number;
  sharedDiscountPct: number;
  nightSurchargePct: number;
  nightStartHour: number;
  nightEndHour: number;
  surgeEnabled: boolean;
  surgeMax: number;
  cancellationFee: number;
}

export const DEFAULT_RULE: FareRule = {
  baseFare: 15000,
  perKm: 11000,
  perMinute: 0,
  minFare: 20000,
  roundTo: 500,
  sharedDiscountPct: 25,
  nightSurchargePct: 0,
  nightStartHour: 22,
  nightEndHour: 5,
  surgeEnabled: true,
  surgeMax: 2,
  cancellationFee: 0,
};

export interface FareInput {
  distanceMeters: number;
  durationSecs: number;
  tripType: 'PRIVATE' | 'SHARED';
  /** Local hour (0–23) of the pickup, already in the pricing time zone. */
  localHour: number;
  surgeMultiplier?: number;
  /** Extra metres the rider adds to a shared route — charged at perKm, not discounted. */
  detourMeters?: number;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  nightSurcharge: number;
  surgeMultiplier: number;
  surgeAmount: number;
  sharedDiscount: number;
  detourFare: number;
  minFareTopUp: number;
  /** Fare before any promotion. */
  subtotal: number;
}

export const roundTo = (amount: number, unit: number) => (unit > 1 ? Math.round(amount / unit) * unit : Math.round(amount));

/** Whether `hour` falls in the [start, end) night window, which may wrap past midnight (22 → 5). */
export function isNightHour(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function computeFare(rule: FareRule, input: FareInput): FareBreakdown {
  const km = input.distanceMeters / 1000;
  const minutes = input.durationSecs / 60;
  const distanceFare = Math.round(km * rule.perKm);
  const timeFare = Math.round(minutes * rule.perMinute);
  const core = rule.baseFare + distanceFare + timeFare;
  const nightSurcharge = isNightHour(input.localHour, rule.nightStartHour, rule.nightEndHour) ? Math.round((core * rule.nightSurchargePct) / 100) : 0;
  const surgeMultiplier = rule.surgeEnabled ? Math.min(rule.surgeMax, Math.max(1, input.surgeMultiplier ?? 1)) : 1;
  const surged = (core + nightSurcharge) * surgeMultiplier;
  const surgeAmount = Math.round(surged - (core + nightSurcharge));
  const sharedDiscount = input.tripType === 'SHARED' ? Math.round((surged * rule.sharedDiscountPct) / 100) : 0;
  const detourFare = input.tripType === 'SHARED' && input.detourMeters ? Math.round((input.detourMeters / 1000) * rule.perKm) : 0;
  const beforeMin = Math.round(surged - sharedDiscount + detourFare);
  const minFareTopUp = Math.max(0, rule.minFare - beforeMin);
  return {
    baseFare: rule.baseFare,
    distanceFare,
    timeFare,
    nightSurcharge,
    surgeMultiplier,
    surgeAmount,
    sharedDiscount,
    detourFare,
    minFareTopUp,
    subtotal: beforeMin + minFareTopUp,
  };
}

export interface PromoLike {
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number | null;
  minFare?: number;
}

/** Discount a promotion yields on `subtotal` (0 when the order is below the promo's minimum). */
export function promoDiscount(promo: PromoLike, subtotal: number): number {
  if (subtotal < (promo.minFare ?? 0)) return 0;
  const raw = promo.type === 'PERCENT' ? Math.round((subtotal * promo.value) / 100) : promo.value;
  const capped = promo.maxDiscount != null ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

/**
 * Live surge from open demand vs. available supply in a zone.
 * ratio ≤ 0.5 → 1.0; then +0.2 per extra unit of ratio, in 0.1 steps, capped.
 * No drivers but open requests → the cap (nobody is coming otherwise).
 */
export function surgeFromSupplyDemand(openRequests: number, availableDrivers: number, max: number): number {
  if (openRequests <= 0) return 1;
  if (availableDrivers <= 0) return Math.max(1, max);
  const ratio = openRequests / availableDrivers;
  if (ratio <= 0.5) return 1;
  const raw = 1 + 0.2 * (ratio - 0.5);
  return Math.min(max, Math.round(raw * 10) / 10);
}

/** Final fare after promo and rounding; never negative. */
export function finalFare(subtotal: number, discount: number, unit: number) {
  return Math.max(0, roundTo(subtotal - discount, unit));
}
