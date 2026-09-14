const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Array<{ field?: string; message: string }> | unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, body: ApiErrorShape) {
    super(body.message || 'Request failed');
    this.status = status;
    this.code = body.code || 'ERROR';
    this.details = body.details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When body is FormData, we must not set Content-Type ourselves.
  isForm?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isForm, signal } = options;

  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (isForm && body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
    credentials: 'include', // send/receive the HTTP-only auth cookie
    signal,
  });

  // Some endpoints (CSV export) return non-JSON.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new ApiError(res.status, { code: 'ERROR', message: res.statusText });
    }
    return (await res.text()) as unknown as T;
  }

  const json = await res.json();
  if (!res.ok || json?.success === false) {
    throw new ApiError(res.status, json?.error || { code: 'ERROR', message: 'Request failed' });
  }
  // Endpoints return { success, data, meta? }. Preserve meta by returning the whole envelope
  // when meta exists; otherwise unwrap data for convenience.
  if (json.meta) return json as T;
  return (json.data !== undefined ? json.data : json) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form, isForm: true }),
  raw: request,
};

export { API_BASE };

/**
 * Build a human-readable message from an error, including per-field
 * validation details the backend attaches (so "Validation failed" becomes
 * "Validation failed: positionId: Invalid id").
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    const d = err.details;
    if (Array.isArray(d) && d.length > 0) {
      const parts = d
        .map((it) => {
          if (typeof it === 'string') return it;
          if (it && typeof it === 'object') {
            const o = it as { field?: string; message?: string };
            return o.field ? `${o.field}: ${o.message ?? ''}` : o.message;
          }
          return undefined;
        })
        .filter(Boolean);
      if (parts.length) return `${err.message}: ${parts.join('; ')}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
