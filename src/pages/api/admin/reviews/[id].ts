/** Moderate one review: publish / hide / back to waiting, public reply, or delete (with its photos). */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb } from '@/server/db/client';
import { reviews } from '@/server/db/schema';
import { requireAdmin, requireUuid } from '@/server/admin/guard';
import { deleteMedia } from '@/server/media';
import { handle, HttpError, json, readJson } from '@/server/http';

const patchBody = z.object({
  status: z.enum(['pending', 'published', 'hidden']).optional(),
  reply: z.string().trim().max(1000, 'Keep the reply under 1000 characters.').nullable().optional(),
});

export const PATCH: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const input = await readJson(request, patchBody);
  const db = getDb();
  const [before] = await db.select({ publishedAt: reviews.publishedAt }).from(reviews).where(eq(reviews.id, id));
  if (!before) throw new HttpError(404, 'Review not found.');

  const set: Partial<typeof reviews.$inferInsert> = {};
  if (input.status) {
    set.status = input.status;
    if (input.status === 'published' && !before.publishedAt) set.publishedAt = new Date();
  }
  if (input.reply !== undefined) {
    set.reply = input.reply || null;
    set.repliedAt = input.reply ? new Date() : null;
  }
  const [review] = await db.update(reviews).set(set).where(eq(reviews.id, id)).returning();
  invalidateCatalog();
  return json({ review });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const [deleted] = await getDb().delete(reviews).where(eq(reviews.id, id)).returning();
  if (!deleted) throw new HttpError(404, 'Review not found.');
  await Promise.all(deleted.images.map((i) => deleteMedia(i.path)));
  invalidateCatalog();
  return json({ ok: true });
});
