import { computeFare, DEFAULT_RULE, finalFare, isNightHour, promoDiscount, roundTo, surgeFromSupplyDemand } from './pricing.util.js';

describe('pricing.util', () => {
  it('prices a private trip: base + per km, minimum fare and rounding', () => {
    const b = computeFare(DEFAULT_RULE, { distanceMeters: 4200, durationSecs: 600, tripType: 'PRIVATE', localHour: 10 });
    expect(b.distanceFare).toBe(46200);
    expect(b.timeFare).toBe(0);
    expect(b.subtotal).toBe(61200);
    expect(finalFare(b.subtotal, 0, 500)).toBe(61000);
    // Very short hop is lifted to the minimum fare.
    const short = computeFare(DEFAULT_RULE, { distanceMeters: 300, durationSecs: 60, tripType: 'PRIVATE', localHour: 10 });
    expect(short.minFareTopUp).toBeGreaterThan(0);
    expect(short.subtotal).toBe(DEFAULT_RULE.minFare);
  });

  it('applies night surcharge, surge and the shared discount in order', () => {
    const rule = { ...DEFAULT_RULE, nightSurchargePct: 20, perMinute: 500 };
    const b = computeFare(rule, { distanceMeters: 10000, durationSecs: 1200, tripType: 'SHARED', localHour: 23, surgeMultiplier: 1.5, detourMeters: 1000 });
    // core = 15000 + 110000 + 10000 = 135000; night 20% = 27000; surge ×1.5 → 243000 (surge amount 81000)
    expect(b.nightSurcharge).toBe(27000);
    expect(b.surgeMultiplier).toBe(1.5);
    expect(b.surgeAmount).toBe(81000);
    expect(b.sharedDiscount).toBe(60750);
    expect(b.detourFare).toBe(11000);
    expect(b.subtotal).toBe(243000 - 60750 + 11000);
  });

  it('ignores surge when disabled and caps it at surgeMax', () => {
    expect(computeFare({ ...DEFAULT_RULE, surgeEnabled: false }, { distanceMeters: 5000, durationSecs: 0, tripType: 'PRIVATE', localHour: 8, surgeMultiplier: 1.8 }).surgeMultiplier).toBe(1);
    expect(computeFare({ ...DEFAULT_RULE, surgeMax: 1.3 }, { distanceMeters: 5000, durationSecs: 0, tripType: 'PRIVATE', localHour: 8, surgeMultiplier: 1.8 }).surgeMultiplier).toBe(1.3);
  });

  it('detects night hours across midnight', () => {
    expect(isNightHour(23, 22, 5)).toBe(true);
    expect(isNightHour(3, 22, 5)).toBe(true);
    expect(isNightHour(5, 22, 5)).toBe(false);
    expect(isNightHour(12, 22, 5)).toBe(false);
    expect(isNightHour(13, 12, 14)).toBe(true);
    expect(isNightHour(3, 5, 5)).toBe(false);
  });

  it('derives surge from open requests vs available drivers', () => {
    expect(surgeFromSupplyDemand(0, 0, 2)).toBe(1);
    expect(surgeFromSupplyDemand(2, 10, 2)).toBe(1);
    expect(surgeFromSupplyDemand(10, 5, 2)).toBe(1.3);
    expect(surgeFromSupplyDemand(30, 5, 2)).toBe(2);
    expect(surgeFromSupplyDemand(3, 0, 1.8)).toBe(1.8);
  });

  it('computes promo discounts with caps and minimums', () => {
    expect(promoDiscount({ type: 'PERCENT', value: 20, maxDiscount: 10000 }, 61000)).toBe(10000);
    expect(promoDiscount({ type: 'PERCENT', value: 10 }, 61000)).toBe(6100);
    expect(promoDiscount({ type: 'FIXED', value: 30000 }, 25000)).toBe(25000);
    expect(promoDiscount({ type: 'FIXED', value: 30000, minFare: 50000 }, 25000)).toBe(0);
    expect(finalFare(61000, 10000, 500)).toBe(51000);
    expect(finalFare(20000, 30000, 500)).toBe(0);
    expect(roundTo(61234, 1)).toBe(61234);
  });
});
