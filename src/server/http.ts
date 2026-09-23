/** Small helpers shared by API routes. */
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** Parses and validates a JSON body; throws a 400 with field errors when invalid. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'The request body must be valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    throw new HttpError(400, 'Please check the highlighted fields.', { fields });
  }
  return parsed.data;
}

/** Wraps a handler so thrown HttpErrors (and unexpected errors) become clean JSON responses. */
export function handle<C>(fn: (ctx: C) => Promise<Response>) {
  return async (ctx: C): Promise<Response> => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
      console.error('[api]', err);
      return json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
    }
  };
}

/** Storefront HTML: cache briefly, serve stale while refreshing. */
export function cachePublicPage(response: { headers: Headers }) {
  response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
}

/**
 * Client IP. The server only listens on localhost behind Caddy, which appends the real client
 * address last in X-Forwarded-For — earlier entries can be forged by the client, so use the last.
 */
export function clientIp(request: Request, fallback?: string): string {
  const chain = request.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
  return chain?.at(-1) || fallback || 'unknown';
}

/** Fixed-window in-memory rate limiter (single-process server). */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    return;
  }
  bucket.count++;
  if (bucket.count > limit) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpError(429, `Too many attempts. Try again in ${retry} seconds.`);
  }
}
