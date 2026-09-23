/**
 * Storefront catalogue (server-side). Published collections and products are read from
 * PostgreSQL and kept in memory for a minute; the admin clears the cache on every save, so
 * changes show up immediately. Without DATABASE_URL (first-time dev) the demo catalogue is used.
 */
import { asc, desc, eq, sql } from 'drizzle-orm';
import { fallbackCollections, fallbackProducts } from '@/data/fallback';
import { getDb, hasDatabase } from '@/server/db/client';
import { collections as collectionsTable, products as productsTable, reviews as reviewsTable } from '@/server/db/schema';
import { getSettings } from '@/server/settings';
import type { CatalogProduct, Collection, Product, StockStatus } from './types';

interface Catalog {
  collections: Collection[];
  products: CatalogProduct[];
}

const TTL_MS = 60_000;
let cache: { at: number; value: Promise<Catalog> } | null = null;

/** True when pages are rendered from the demo catalogue (no database configured). */
export const isDemoCatalog = !hasDatabase();

export function invalidateCatalog() {
  cache = null;
}

export function stockStatus(qty: number | null, lowThreshold: number): StockStatus {
  if (qty == null) return 'in_stock';
  if (qty <= 0) return 'sold_out';
  return qty <= lowThreshold ? 'low_stock' : 'in_stock';
}

function join(collections: Collection[], products: Product[]): Catalog {
  const byId = new Map(collections.map((c) => [c.id, c]));
  return {
    collections,
    products: products.map((p) => {
      const col = p.collection_id ? byId.get(p.collection_id) : undefined;
      return { ...p, collection: col ? { id: col.id, slug: col.slug, name: col.name } : null };
    }),
  };
}

async function fetchCatalog(): Promise<Catalog> {
  if (!hasDatabase()) {
    if (import.meta.env.PROD) throw new Error('[catalog] DATABASE_URL is not set.');
    return join(fallbackCollections, fallbackProducts);
  }
  const db = getDb();
  const [cols, prods, settings, ratings] = await Promise.all([
    db.select().from(collectionsTable).where(eq(collectionsTable.isPublished, true)).orderBy(asc(collectionsTable.sortOrder)),
    db
      .select()
      .from(productsTable)
      .where(eq(productsTable.isPublished, true))
      .orderBy(asc(productsTable.sortOrder), desc(productsTable.createdAt)),
    getSettings(),
    db
      .select({ productId: reviewsTable.productId, average: sql<number>`avg(${reviewsTable.rating})::float8`, count: sql<number>`count(*)::int` })
      .from(reviewsTable)
      .where(eq(reviewsTable.status, 'published'))
      .groupBy(reviewsTable.productId),
  ]);
  const ratingOf = new Map(ratings.map((r) => [r.productId, { average: r.average, count: r.count }]));

  const collections: Collection[] = cols.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    cover_path: c.coverPath,
    sort_order: c.sortOrder,
    is_published: c.isPublished,
  }));
  const visible = new Set(collections.map((c) => c.id));
  const low = settings.inventory.lowStockThreshold;

  const products: Product[] = prods.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    short_description: p.shortDescription,
    description: p.description,
    price_inr: p.pricePaise == null ? null : p.pricePaise / 100,
    compare_at_price_inr: p.compareAtPaise == null ? null : p.compareAtPaise / 100,
    // A product inside an unpublished collection is still sold, just without its collection link.
    collection_id: p.collectionId && visible.has(p.collectionId) ? p.collectionId : null,
    product_type: p.productType,
    material: p.material,
    images: p.images ?? [],
    sku: p.sku,
    stock_qty: p.stockQty,
    stock_status: stockStatus(p.stockQty, low),
    rating: ratingOf.get(p.id) ?? null,
    is_featured: p.isFeatured,
    is_published: p.isPublished,
    sort_order: p.sortOrder,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  }));
  return join(collections, products);
}

export function loadCatalog(): Promise<Catalog> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const value = fetchCatalog();
    cache = { at: Date.now(), value };
    value.catch(() => (cache = null));
  }
  return cache.value;
}

export async function getCollections(): Promise<Collection[]> {
  return (await loadCatalog()).collections;
}

export async function getProducts(): Promise<CatalogProduct[]> {
  return (await loadCatalog()).products;
}

export async function getProduct(slug: string): Promise<CatalogProduct | undefined> {
  return (await getProducts()).find((p) => p.slug === slug);
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  return (await getCollections()).find((c) => c.slug === slug);
}

/** Featured pieces first, topped up with the rest so the grid always fills whole rows. */
export async function getFeaturedProducts(limit = 8): Promise<CatalogProduct[]> {
  const products = await getProducts();
  const featured = products.filter((p) => p.is_featured);
  const rest = products.filter((p) => !p.is_featured);
  const list = [...featured, ...rest].slice(0, limit);
  const rows = list.length >= 4 ? Math.floor(list.length / 4) * 4 : list.length;
  return list.slice(0, rows);
}

export async function getProductsInCollection(collectionId: string): Promise<CatalogProduct[]> {
  return (await getProducts()).filter((p) => p.collection_id === collectionId);
}

export function relatedProducts(product: CatalogProduct, all: CatalogProduct[], limit = 4): CatalogProduct[] {
  const others = all.filter((p) => p.id !== product.id);
  const same = others.filter((p) => p.collection_id && p.collection_id === product.collection_id);
  const sameType = others.filter((p) => !same.includes(p) && p.product_type === product.product_type);
  return [...same, ...sameType, ...others.filter((p) => !same.includes(p) && !sameType.includes(p))].slice(0, limit);
}
