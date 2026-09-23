/** Review moderation list: ?status=pending|published|hidden|all&page=1 */
import type { APIRoute } from 'astro';
import { count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { customers, orders, products, reviews } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { handle, json } from '@/server/http';

const PAGE = 30;
const STATUSES = ['pending', 'published', 'hidden'] as const;

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const db = getDb();
  const status = url.searchParams.get('status') ?? 'pending';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const filter = (STATUSES as readonly string[]).includes(status) ? eq(reviews.status, status as (typeof STATUSES)[number]) : undefined;

  const [rows, counts, [avg]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        authorName: reviews.authorName,
        images: reviews.images,
        status: reviews.status,
        reply: reviews.reply,
        repliedAt: reviews.repliedAt,
        publishedAt: reviews.publishedAt,
        createdAt: reviews.createdAt,
        product: { id: products.id, name: products.name, slug: products.slug },
        orderNumber: orders.number,
        customerId: customers.id,
        customerName: customers.name,
      })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .leftJoin(orders, eq(orders.id, reviews.orderId))
      .leftJoin(customers, eq(customers.id, reviews.customerId))
      .where(filter)
      .orderBy(desc(reviews.createdAt))
      .limit(PAGE + 1)
      .offset((page - 1) * PAGE),
    db.select({ status: reviews.status, n: count() }).from(reviews).groupBy(reviews.status),
    db.select({ average: sql<number | null>`avg(${reviews.rating})::float8` }).from(reviews).where(eq(reviews.status, 'published')),
  ]);

  return json({
    reviews: rows.slice(0, PAGE),
    hasMore: rows.length > PAGE,
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])),
    average: avg?.average ?? null,
  });
});
