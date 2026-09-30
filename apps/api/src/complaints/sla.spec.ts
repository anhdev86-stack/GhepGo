import { deadlines, defaultPriority, describeRemaining, loadSlaPolicy } from './sla.js';

describe('complaint SLA policy', () => {
  it('maps categories to priorities with SAFETY urgent', () => {
    expect(defaultPriority('SAFETY')).toBe('URGENT');
    expect(defaultPriority('PAYMENT')).toBe('HIGH');
    expect(defaultPriority('ROUTE')).toBe('NORMAL');
    expect(defaultPriority('OTHER')).toBe('LOW');
    expect(defaultPriority('???')).toBe('NORMAL');
  });

  it('computes deadlines from the priority clock and honours env overrides', () => {
    const created = new Date('2026-09-30T00:00:00Z');
    const d = deadlines(loadSlaPolicy({}), 'URGENT', created);
    expect(d.firstResponseDueAt.toISOString()).toBe('2026-09-30T00:15:00.000Z');
    expect(d.dueAt.toISOString()).toBe('2026-09-30T04:00:00.000Z');

    const custom = loadSlaPolicy({ COMPLAINT_SLA_NORMAL: '30, 600', COMPLAINT_SLA_LOW: 'garbage' });
    expect(custom.NORMAL).toEqual({ firstResponseMin: 30, resolveMin: 600 });
    expect(custom.LOW).toEqual({ firstResponseMin: 24 * 60, resolveMin: 72 * 60 });
  });

  it('describes remaining time in Vietnamese', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    expect(describeRemaining(new Date('2026-09-30T12:10:00Z'), now)).toMatchObject({ overdue: false, text: 'còn 2 giờ 10 phút' });
    expect(describeRemaining(new Date('2026-09-30T09:25:00Z'), now)).toMatchObject({ overdue: true, text: 'quá hạn 35 phút', minutes: -35 });
  });
});
