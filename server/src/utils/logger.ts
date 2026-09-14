/* Minimal structured logger. Avoids extra deps while keeping output readable. */
const ts = () => new Date().toISOString();

export const logger = {
  info: (msg: string, meta?: unknown) =>
    // eslint-disable-next-line no-console
    console.log(`[${ts()}] INFO  ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: unknown) =>
    // eslint-disable-next-line no-console
    console.warn(`[${ts()}] WARN  ${msg}`, meta ?? ''),
  error: (msg: string, meta?: unknown) =>
    // eslint-disable-next-line no-console
    console.error(`[${ts()}] ERROR ${msg}`, meta ?? ''),
};
