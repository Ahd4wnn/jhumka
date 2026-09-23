import type { APIRoute } from 'astro';
import { asc, count } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb } from '@/server/db/client';
import { collections, products } from '@/server/db/schema';
import { requireAdmin, rethrowUnique } from '@/server/admin/guard';
import { collectionInput } from '@/server/admin/schemas';
import { handle, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  const db = getDb();
  const [rows, counts] = await Promise.all([
    db.select().from(collections).orderBy(asc(collections.sortOrder)),
    db.select({ id: products.collectionId, n: count() }).from(products).groupBy(products.collectionId),
  ]);
  const byId = new Map(counts.map((c) => [c.id, c.n]));
  return json({ collections: rows.map((c) => ({ ...c, productCount: byId.get(c.id) ?? 0 })) });
});

export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const input = await readJson(request, collectionInput);
  const [created] = await getDb()
    .insert(collections)
    .values(input)
    .returning()
    .catch((e) => rethrowUnique(e, 'Another collection already uses that web address.'));
  invalidateCatalog();
  return json({ collection: created }, { status: 201 });
});

