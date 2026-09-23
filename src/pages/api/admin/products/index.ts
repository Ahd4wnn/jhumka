import type { APIRoute } from 'astro';
import { asc, desc } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb } from '@/server/db/client';
import { products } from '@/server/db/schema';
import { requireAdmin, rethrowUnique } from '@/server/admin/guard';
import { productInput } from '@/server/admin/schemas';
import { handle, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  const rows = await getDb().select().from(products).orderBy(asc(products.sortOrder), desc(products.createdAt));
  return json({ products: rows });
});

export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const input = await readJson(request, productInput);
  const [created] = await getDb()
    .insert(products)
    .values(input)
    .returning()
    .catch((e) => rethrowUnique(e, 'Another piece already uses that web address or SKU.'));
  invalidateCatalog();
  return json({ product: created }, { status: 201 });
});
