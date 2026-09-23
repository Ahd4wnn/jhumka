/** Customers list. ?q=name/phone/email · ?tag= · ?sort=recent|value|orders|new · ?page= */
import type { APIRoute } from 'astro';
import { and, arrayContains, asc, count, desc, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { customers } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { handle, json } from '@/server/http';

const PAGE = 50;

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const q = url.searchParams.get('q')?.trim();
  const tag = url.searchParams.get('tag')?.trim();
  const sort = url.searchParams.get('sort') ?? 'recent';
  const buyersOnly = url.searchParams.get('buyers') !== '0';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  const where: SQL[] = [];
  if (buyersOnly) where.push(gt(customers.ordersCount, 0));
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    where.push(or(ilike(customers.name, like), ilike(customers.phone, like), sql`${customers.email}::text ilike ${like}`)!);
  }
  if (tag) where.push(arrayContains(customers.tags, [tag]));
  const cond = where.length ? and(...where) : undefined;
  const order =
    sort === 'value'
      ? [desc(customers.totalSpentPaise)]
      : sort === 'orders'
        ? [desc(customers.ordersCount)]
        : sort === 'new'
          ? [desc(customers.createdAt)]
          : [sql`${customers.lastOrderAt} desc nulls last`, asc(customers.name)];

  const db = getDb();
  const [rows, [{ total }], tags] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(cond)
      .orderBy(...order)
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(customers).where(cond),
    db.execute(sql`select tag, count(*)::int as n from (select unnest(tags) as tag from customers) t group by tag order by n desc limit 50`),
  ]);
  return json({ customers: rows, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, tags });
});
