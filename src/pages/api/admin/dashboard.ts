import type { APIRoute } from 'astro';
import { requireAdmin } from '@/server/admin/guard';
import { dashboard } from '@/server/admin/reports';
import { handle, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json(await dashboard());
});
