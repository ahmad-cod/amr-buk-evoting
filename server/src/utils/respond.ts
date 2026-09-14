import { Response } from 'express';

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created(res: Response, data: unknown): void {
  ok(res, data, 201);
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function paginated(res: Response, items: unknown[], meta: PageMeta): void {
  res.status(200).json({ success: true, data: items, meta });
}

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
