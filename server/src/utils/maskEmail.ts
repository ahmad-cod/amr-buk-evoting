/**
 * Deterministically masks an email address for administrative list views,
 * preventing shoulder surfing and broad PII exposure while retaining
 * enough character context for recognition.
 *
 * Example:
 *  "abdulsalam.abdulrauf296@gmail.com" -> "abd******@gmail.com"
 *  "a@b.com" -> "a*@b.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  if (local.length <= 4) {
    return `${local.slice(0, 2)}**@${domain}`;
  }
  const prefix = local.slice(0, 3);
  return `${prefix}******@${domain}`;
}
