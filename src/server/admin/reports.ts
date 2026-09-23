/**
 * Dashboard and report queries. Sales = orders that were paid and are not cancelled/refunded.
 * Dates are bucketed in India time (Asia/Kolkata).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { getSettings } from '../settings';

const SALE = sql.raw(`('paid','packed','shipped','delivered')`);
const IST = sql.raw(`'Asia/Kolkata'`);

type Row = Record<string, unknown>;
const rows = async <T = Row>(q: ReturnType<typeof sql>) => (await getDb().execute(q)) as unknown as T[];

export async function dashboard() {
  const { inventory } = await getSettings();
  const [periods, series, top, recent, toShip, lowStock, repeat, abandoned, dueTasks, pendingReviews] = await Promise.all([
    rows<{ period: string; orders: number; revenue: number }>(sql`
      select p.period, count(o.id)::int as orders, coalesce(sum(o.total_paise), 0)::bigint::float8 as revenue
      from (values ('today', 0), ('7d', 6), ('30d', 29)) as p(period, days)
      left join orders o on o.status in ${SALE}
        and (o.paid_at at time zone ${IST})::date >= (now() at time zone ${IST})::date - p.days
      group by p.period`),
    rows<{ day: string; orders: number; revenue: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day, count(o.id)::int as orders, coalesce(sum(o.total_paise), 0)::float8 as revenue
      from generate_series((now() at time zone ${IST})::date - 29, (now() at time zone ${IST})::date, interval '1 day') as d
      left join orders o on o.status in ${SALE} and (o.paid_at at time zone ${IST})::date = d::date
      group by d order by d`),
    rows<{ name: string; slug: string; qty: number; revenue: number }>(sql`
      select i.name, i.slug, sum(i.qty)::int as qty, sum(i.line_total_paise)::float8 as revenue
      from order_items i join orders o on o.id = i.order_id
      where o.status in ${SALE} and o.paid_at >= now() - interval '30 days'
      group by i.name, i.slug order by revenue desc limit 5`),
    rows(sql`
      select number, status, name, total_paise as "totalPaise", paid_at as "paidAt", shipping_address->>'city' as city
      from orders where paid_at is not null order by paid_at desc limit 8`),
    rows<{ paid: number; packed: number }>(sql`
      select count(*) filter (where status = 'paid')::int as paid, count(*) filter (where status = 'packed')::int as packed from orders`),
    rows(sql`
      select id, name, slug, stock_qty as "stockQty" from products
      where stock_qty is not null and stock_qty <= ${inventory.lowStockThreshold} and is_published order by stock_qty, name limit 10`),
    rows<{ buyers: number; repeaters: number }>(sql`
      select count(*) filter (where orders_count >= 1)::int as buyers, count(*) filter (where orders_count >= 2)::int as repeaters from customers`),
    rows<{ n: number; value: number }>(sql`
      select count(*)::int as n, coalesce(sum(total_paise), 0)::float8 as value from orders
      where status in ('pending_payment','payment_failed') and created_at >= now() - interval '7 days'
        and created_at < now() - interval '30 minutes' and recovery_contacted_at is null`),
    rows<{ n: number }>(sql`
      select count(*)::int as n from tasks where done_at is null and due_at <= date_trunc('day', now() at time zone ${IST}) + interval '1 day'`),
    rows<{ n: number }>(sql`select count(*)::int as n from reviews where status = 'pending'`),
  ]);

  const by = Object.fromEntries(periods.map((p) => [p.period, { orders: p.orders, revenuePaise: Number(p.revenue), aovPaise: p.orders ? Math.round(Number(p.revenue) / p.orders) : 0 }]));
  return {
    periods: by,
    series: series.map((s) => ({ day: s.day, orders: s.orders, revenuePaise: Number(s.revenue) })),
    topProducts: top.map((t) => ({ ...t, revenuePaise: Number(t.revenue) })),
    recentOrders: recent,
    toShip: toShip[0],
    lowStock,
    repeatRate: repeat[0].buyers ? repeat[0].repeaters / repeat[0].buyers : 0,
    buyers: repeat[0].buyers,
    abandoned: { count: abandoned[0].n, valuePaise: Number(abandoned[0].value) },
    tasksDue: dueTasks[0].n,
    reviewsPending: pendingReviews[0].n,
  };
}

export async function report(from: Date, to: Date, granularity: 'day' | 'month') {
  const bucket = granularity === 'month' ? sql.raw(`'YYYY-MM'`) : sql.raw(`'YYYY-MM-DD'`);
  // Raw sql params skip Drizzle's column mapping, and postgres.js (as Drizzle configures it) only takes strings.
  const range = sql`o.paid_at >= ${from.toISOString()}::timestamptz and o.paid_at < ${to.toISOString()}::timestamptz`;
  const [series, byProduct, byCollection, customers, couponsUsed, totals] = await Promise.all([
    rows(sql`
      select to_char(o.paid_at at time zone ${IST}, ${bucket}) as period, count(*)::int as orders,
        sum(o.total_paise)::float8 as "revenuePaise", sum(o.discount_paise)::float8 as "discountPaise"
      from orders o where o.status in ${SALE} and ${range} group by 1 order by 1`),
    rows(sql`
      select i.name, i.slug, sum(i.qty)::int as qty, sum(i.line_total_paise)::float8 as "revenuePaise"
      from order_items i join orders o on o.id = i.order_id
      where o.status in ${SALE} and ${range} group by i.name, i.slug order by "revenuePaise" desc limit 50`),
    rows(sql`
      select coalesce(c.name, 'No collection') as name, sum(i.qty)::int as qty, sum(i.line_total_paise)::float8 as "revenuePaise"
      from order_items i join orders o on o.id = i.order_id
      left join products p on p.id = i.product_id left join collections c on c.id = p.collection_id
      where o.status in ${SALE} and ${range} group by 1 order by "revenuePaise" desc`),
    rows(sql`
      with firsts as (select customer_id, min(paid_at) as first_paid from orders where status in ${SALE} group by customer_id)
      select count(*) filter (where o.paid_at = f.first_paid)::int as "newCustomers",
             count(*) filter (where o.paid_at > f.first_paid)::int as "repeatOrders"
      from orders o join firsts f on f.customer_id = o.customer_id where o.status in ${SALE} and ${range}`),
    rows(sql`
      select o.coupon_code as code, count(*)::int as uses, sum(o.discount_paise)::float8 as "discountPaise"
      from orders o where o.status in ${SALE} and o.coupon_code is not null and ${range} group by 1 order by uses desc`),
    rows(sql`
      select count(*)::int as orders, coalesce(sum(o.total_paise), 0)::float8 as "revenuePaise",
        coalesce(sum(o.discount_paise), 0)::float8 as "discountPaise", coalesce(sum(o.shipping_paise), 0)::float8 as "shippingPaise"
      from orders o where o.status in ${SALE} and ${range}`),
  ]);
  const [refunds] = await rows<{ refunded: number }>(sql`
    select coalesce(sum(refunded_paise), 0)::float8 as refunded from orders o where ${range}`);
  return { series, byProduct, byCollection, customers: customers[0], coupons: couponsUsed, totals: { ...totals[0], refundedPaise: refunds.refunded } };
}

/** RFC 4180 CSV with a BOM so Excel opens ₹ and names correctly. */
export function toCsv(header: string[], data: unknown[][]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [header, ...data].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
