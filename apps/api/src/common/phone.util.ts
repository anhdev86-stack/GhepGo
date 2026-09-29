/**
 * Normalises Vietnamese phone numbers to E.164 (+84xxxxxxxxx).
 * Accepts 0912345678, 84912345678, +84912345678, with spaces/dots/dashes.
 * Returns null when the number is not a plausible VN mobile number.
 */
export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '');
  let national: string;
  if (/^\+84\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^84\d{9}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else return null;
  // VN mobile prefixes start with 3, 5, 7, 8, 9 after the leading 0
  if (!/^[35789]\d{8}$/.test(national)) return null;
  return `+84${national}`;
}

/** Display form used across the app and stored in the DB: 0xxxxxxxxx. */
export function toLocalVnPhone(e164: string): string {
  return e164.startsWith('+84') ? `0${e164.slice(3)}` : e164;
}
