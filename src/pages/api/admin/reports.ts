/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, India time) &granularity=day|month */
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/server/admin/guard';
import { report } from '@/server/admin/reports';
import { handle, HttpError, json } from '@/server/http';

const istDay = (s: string) => new Date(`${s}T00:00:00+05:30`);

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const toStr = url.searchParams.get('to') ?? today;
  const fromStr = url.searchParams.get('from') ?? new Date(istDay(toStr).getTime() - 89 * 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) throw new HttpError(400, 'Use dates like 2026-09-01.');
  const from = istDay(fromStr);
  const to = new Date(istDay(toStr).getTime() + 86_400_000);
  if (to <= from) throw new HttpError(400, 'The end date must be after the start date.');
  const granularity = url.searchParams.get('granularity') === 'month' ? 'month' : 'day';
  return json({ from: fromStr, to: toStr, granularity, ...(await report(from, to, granularity)) });
});
