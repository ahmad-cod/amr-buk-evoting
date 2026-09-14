import { customAlphabet } from 'nanoid';

// Unambiguous alphabet (no 0/O/1/I) for human-readable receipt codes.
const receiptAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const nano = customAlphabet(receiptAlphabet, 4);

/** Produces a code like AMR-7F3K-Q9M2. Reveals nothing about the selections. */
export function generateReceiptCode(): string {
  return `AMR-${nano()}-${nano()}`;
}

const idNano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

export function generateIdempotencyFallback(): string {
  return idNano();
}

export function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
