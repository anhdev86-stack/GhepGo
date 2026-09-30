import { cellOf, confidenceFor, nextHours, shiftHoursBySlot, slotIndex, slotOf, weightedMean } from './forecast.util.js';

const TZ = 'Asia/Ho_Chi_Minh';

describe('forecast.util', () => {
  it('maps instants to hour-of-week slots in the forecast time zone', () => {
    // 2026-09-30T00:30Z is Wednesday 07:30 in Ho Chi Minh City (UTC+7).
    expect(slotOf(new Date('2026-09-30T00:30:00Z'), TZ)).toEqual({ dow: 3, hour: 7 });
    // 2026-10-03T17:10Z is Sunday 00:10 in Ho Chi Minh City.
    expect(slotOf(new Date('2026-10-03T17:10:00Z'), TZ)).toEqual({ dow: 0, hour: 0 });
    expect(slotIndex({ dow: 3, hour: 7 })).toBe(79);
  });

  it('weights recent weeks more and treats missing weeks as zero', () => {
    const counts = new Map<number, number>([
      [1, 10],
      [2, 0],
      [3, 10],
    ]);
    const m = weightedMean(counts, 3, 0.5);
    // (1·10 + 0.5·0 + 0.25·10) / 1.75
    expect(m).toBeCloseTo(12.5 / 1.75, 6);
    expect(weightedMean(new Map(), 4)).toBe(0);
  });

  it('bins coordinates into stable ~1 km cells with midpoint centers', () => {
    const a = cellOf(10.7769, 106.7009);
    const b = cellOf(10.7712, 106.7051);
    expect(a.key).toBe('1077:10670');
    expect(a.key).toBe(b.key);
    expect(a.lat).toBeCloseTo(10.775, 6);
    expect(a.lng).toBeCloseTo(106.705, 6);
    expect(cellOf(10.79, 106.70).key).not.toBe(a.key);
  });

  it('spreads a shift across hour slots as fractional hours', () => {
    // Wednesday 07:30 → 09:15 local
    const hours = shiftHoursBySlot(new Date('2026-09-30T00:30:00Z'), new Date('2026-09-30T02:15:00Z'), TZ);
    expect(hours[slotIndex({ dow: 3, hour: 7 })]).toBeCloseTo(0.5, 6);
    expect(hours[slotIndex({ dow: 3, hour: 8 })]).toBeCloseTo(1, 6);
    expect(hours[slotIndex({ dow: 3, hour: 9 })]).toBeCloseTo(0.25, 6);
    expect(Array.from(hours).reduce((a, b) => a + b, 0)).toBeCloseTo(1.75, 6);
  });

  it('builds an hour-aligned horizon and grades confidence', () => {
    const hs = nextHours(new Date('2026-09-30T00:30:00Z'), 3);
    expect(hs.map((d) => d.toISOString())).toEqual(['2026-09-30T00:00:00.000Z', '2026-09-30T01:00:00.000Z', '2026-09-30T02:00:00.000Z']);
    expect(confidenceFor(1)).toBe('low');
    expect(confidenceFor(3)).toBe('medium');
    expect(confidenceFor(8)).toBe('high');
  });
});
