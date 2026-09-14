/** Uppercase, trim, collapse whitespace. */
export function normalizeRegNumber(input: string): string {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Check if string is non-empty identifier. */
export function isValidRegNumberFormat(reg: string): boolean {
  return Boolean(reg && normalizeRegNumber(reg).length >= 2);
}

export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

/** Generic identifier normalizer: email if contains @, else uppercase alphanumeric */
export function normalizeIdentifier(input: string): string {
  const str = String(input || '').trim();
  if (str.includes('@')) return normalizeEmail(str);
  return normalizeRegNumber(str);
}

