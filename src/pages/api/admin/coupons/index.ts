import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { coupons } from '@/server/db/schema';
import { requireAdmin, rethrowUnique } from '@/server/admin/guard';
import { couponInput } from '@/server/admin/schemas';
import { handle, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json({ coupons: await getDb().select().from(coupons).orderBy(desc(coupons.createdAt)) });
});

export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const input = await readJson(request, couponInput);
  const [created] = await getDb()
    .insert(coupons)
    .values(input)
    .returning()
    .catch((e) => rethrowUnique(e, 'That code already exists.'));
  return json({ coupon: created }, { status: 201 });
});
