import { normalizeVnPhone, toLocalVnPhone } from './phone.util.js';

describe('normalizeVnPhone', () => {
  it('accepts common VN formats', () => {
    expect(normalizeVnPhone('0912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('84912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('+84 912 345 678')).toBe('+84912345678');
    expect(normalizeVnPhone('091-234-5678')).toBe('+84912345678');
  });
  it('rejects invalid numbers', () => {
    expect(normalizeVnPhone('12345')).toBeNull();
    expect(normalizeVnPhone('0112345678')).toBeNull();
    expect(normalizeVnPhone('+1 555 123 4567')).toBeNull();
    expect(normalizeVnPhone('')).toBeNull();
  });
  it('converts back to local display form', () => {
    expect(toLocalVnPhone('+84912345678')).toBe('0912345678');
  });
});
