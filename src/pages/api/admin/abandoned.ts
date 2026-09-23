/** Abandoned checkouts: contact details were saved, but payment never completed (30+ min ago). */
import type { APIRoute } from 'astro';
import { and, desc, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { orderItems, orders } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { env } from '@/server/env';
import { handle, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      name: orders.name,
      phone: orders.phone,
      email: orders.email,
      totalPaise: orders.totalPaise,
      createdAt: orders.createdAt,
      contactedAt: orders.recoveryContactedAt,
      token: orders.accessToken,
      items: sql<string>`(select string_agg(${orderItems.name} || ' × ' || ${orderItems.qty}, ', ') from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
      // Did the same customer pay for another order afterwards?
      recovered: sql<boolean>`exists (select 1 from ${orders} o2 where o2.customer_id = ${orders.customerId} and o2.paid_at > ${orders.createdAt})`,
    })
    .from(orders)
    .where(and(inArray(orders.status, ['pending_payment', 'payment_failed']), lt(orders.createdAt, cutoff)))
    .orderBy(desc(orders.createdAt))
    .limit(Math.min(500, Number(url.searchParams.get('limit')) || 200));

  const site = env.PUBLIC_SITE_URL;
  return json({
    checkouts: rows.map(({ token, ...r }) => ({ ...r, recoveryLink: `${site}/order/${r.number}?t=${token}` })),
  });
});

