import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb } from '@/server/db/client';
import { collections } from '@/server/db/schema';
import { requireAdmin, requireUuid, rethrowUnique } from '@/server/admin/guard';
import { collectionInput } from '@/server/admin/schemas';
import { deleteMedia } from '@/server/media';
import { handle, HttpError, json, readJson } from '@/server/http';

export const PUT: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const input = await readJson(request, collectionInput);
  const db = getDb();
  const [before] = await db.select({ coverPath: collections.coverPath }).from(collections).where(eq(collections.id, id));
  if (!before) throw new HttpError(404, 'Collection not found.');
  const [updated] = await db
    .update(collections)
    .set(input)
    .where(eq(collections.id, id))
    .returning()
    .catch((e) => rethrowUnique(e, 'Another collection already uses that web address.'));
  if (before.coverPath && before.coverPath !== input.coverPath) await deleteMedia(before.coverPath);
  invalidateCatalog();
  return json({ collection: updated });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const [deleted] = await getDb().delete(collections).where(eq(collections.id, id)).returning();
  if (!deleted) throw new HttpError(404, 'Collection not found.');
  if (deleted.coverPath) await deleteMedia(deleted.coverPath);
  invalidateCatalog();
  return json({ ok: true });
});
