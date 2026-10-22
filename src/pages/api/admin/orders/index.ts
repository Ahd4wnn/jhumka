/**
 * Orders list. ?status=<status>|open|all · ?q=number/name/phone/email · ?from=&to= (ISO dates) · ?page=
 * "open" (default) = paid / packed / shipped — the work queue. Unpaid checkouts live under Abandoned.
 */
import type { APIRoute } from 'astro';
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { orderItems, orders } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { ORDER_STATUSES, type OrderStatus } from '@/server/commerce/status';
import { handle, json } from '@/server/http';

const PAGE = 50;

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const status = url.searchParams.get('status') ?? 'open';
  const q = url.searchParams.get('q')?.trim();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  const where: SQL[] = [];
  if (status === 'open') where.push(inArray(orders.status, ['paid', 'packed', 'shipped']));
  else if (status === 'all') where.push(inArray(orders.status, ['paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded']));
  else if ((ORDER_STATUSES as readonly string[]).includes(status)) where.push(eq(orders.status, status as OrderStatus));
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    where.push(or(ilike(orders.number, like), ilike(orders.name, like), ilike(orders.phone, like), sql`${orders.email}::text ilike ${like}`)!);
  }
  if (from) where.push(gte(orders.createdAt, new Date(from)));
  if (to) where.push(lte(orders.createdAt, new Date(to)));

  const db = getDb();
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        name: orders.name,
        phone: orders.phone,
        city: sql<string>`${orders.shippingAddress}->>'city'`,
        totalPaise: orders.totalPaise,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        items: sql<number>`(select coalesce(sum(${orderItems.qty}), 0)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
        courier: orders.courier,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        // Same link as the detail route; the raw token is never returned on its own.
        customerLink: sql<string>`'/order/' || ${orders.number} || '?t=' || ${orders.accessToken}`,
      })
      .from(orders)
      .where(cond)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(orders).where(cond),
    db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status),
  ]);

  return json({
    orders: rows,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    total,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  });
});
