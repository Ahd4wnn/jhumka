import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { coupons } from '@/server/db/schema';
import { requireAdmin, requireUuid, rethrowUnique } from '@/server/admin/guard';
import { couponInput } from '@/server/admin/schemas';
import { handle, HttpError, json, readJson } from '@/server/http';

export const PUT: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const input = await readJson(request, couponInput);
  const [updated] = await getDb()
    .update(coupons)
    .set(input)
    .where(eq(coupons.id, requireUuid(params.id)))
    .returning()
    .catch((e) => rethrowUnique(e, 'That code already exists.'));
  if (!updated) throw new HttpError(404, 'Coupon not found.');
  return json({ coupon: updated });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  await getDb().delete(coupons).where(eq(coupons.id, requireUuid(params.id)));
  return json({ ok: true });
});
