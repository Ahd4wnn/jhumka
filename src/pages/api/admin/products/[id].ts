import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb } from '@/server/db/client';
import { products, reviews } from '@/server/db/schema';
import { requireAdmin, requireUuid, rethrowUnique } from '@/server/admin/guard';
import { productInput, productPatch } from '@/server/admin/schemas';
import { deleteMedia } from '@/server/media';
import { handle, HttpError, json, readJson } from '@/server/http';

export const PUT: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const input = await readJson(request, productInput);
  const db = getDb();
  const [before] = await db.select({ images: products.images }).from(products).where(eq(products.id, id));
  if (!before) throw new HttpError(404, 'Product not found.');
  const [updated] = await db
    .update(products)
    .set(input)
    .where(eq(products.id, id))
    .returning()
    .catch((e) => rethrowUnique(e, 'Another piece already uses that web address or SKU.'));
  // Photos removed in the editor are deleted from disk once the change is saved.
  const kept = new Set(input.images.map((i) => i.path));
  await Promise.all(before.images.filter((i) => !kept.has(i.path)).map((i) => deleteMedia(i.path)));
  invalidateCatalog();
  return json({ product: updated });
});

/** Quick toggles from the product list (publish, feature, stock). */
export const PATCH: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const patch = await readJson(request, productPatch);
  const db = getDb();
  if (patch.isPublished) {
    const [p] = await db.select({ price: products.pricePaise }).from(products).where(eq(products.id, id));
    if (p?.price == null) throw new HttpError(400, 'Add a price before publishing this piece.');
  }
  const [updated] = await db.update(products).set(patch).where(eq(products.id, id)).returning();
  if (!updated) throw new HttpError(404, 'Product not found.');
  invalidateCatalog();
  return json({ product: updated });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const db = getDb();
  // Its reviews are removed with it (ON DELETE CASCADE); their photos are cleaned up here.
  const reviewPhotos = (await db.select({ images: reviews.images }).from(reviews).where(eq(reviews.productId, id))).flatMap((r) => r.images);
  const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
  if (!deleted) throw new HttpError(404, 'Product not found.');
  await Promise.all([...deleted.images, ...reviewPhotos].map((i) => deleteMedia(i.path)));
  invalidateCatalog();
  return json({ ok: true });
});
