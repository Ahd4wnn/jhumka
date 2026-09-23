/** CSV exports: /api/admin/export/orders.csv and /api/admin/export/customers.csv */
import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { requireAdmin } from '@/server/admin/guard';
import { toCsv } from '@/server/admin/reports';
import { handle, HttpError } from '@/server/http';

const rupees = (paise: unknown) => (Number(paise ?? 0) / 100).toFixed(2);

export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const db = getDb();
  const stamp = new Date().toISOString().slice(0, 10);
  let csv: string;
  let name: string;

  if (params.kind === 'orders.csv') {
    const rows = (await db.execute(sql`
      select o.number, o.created_at, o.paid_at, o.status, o.name, o.phone, o.email,
        o.shipping_address->>'line1' as line1, o.shipping_address->>'line2' as line2, o.shipping_address->>'city' as city,
        o.shipping_address->>'state' as state, o.shipping_address->>'pincode' as pincode,
        (select string_agg(i.name || ' x' || i.qty, '; ') from order_items i where i.order_id = o.id) as items,
        o.subtotal_paise, o.discount_paise, o.shipping_paise, o.total_paise, o.refunded_paise, o.coupon_code,
        o.razorpay_payment_id, o.payment_method, o.invoice_no, o.courier, o.tracking_number
      from orders o where o.status <> 'pending_payment' order by o.created_at desc`)) as unknown as Record<string, unknown>[];
    csv = toCsv(
      ['Order', 'Created', 'Paid', 'Status', 'Name', 'Phone', 'Email', 'Address 1', 'Address 2', 'City', 'State', 'Pincode', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Refunded', 'Coupon', 'Razorpay payment', 'Method', 'Invoice no', 'Courier', 'Tracking'],
      rows.map((r) => [r.number, r.created_at, r.paid_at, r.status, r.name, r.phone, r.email, r.line1, r.line2, r.city, r.state, r.pincode, r.items, rupees(r.subtotal_paise), rupees(r.discount_paise), rupees(r.shipping_paise), rupees(r.total_paise), rupees(r.refunded_paise), r.coupon_code, r.razorpay_payment_id, r.payment_method, r.invoice_no, r.courier, r.tracking_number]),
    );
    name = `jhumka-orders-${stamp}.csv`;
  } else if (params.kind === 'customers.csv') {
    const rows = (await db.execute(sql`
      select name, phone, email, orders_count, total_spent_paise, last_order_at, array_to_string(tags, '; ') as tags, created_at,
        default_address->>'city' as city, default_address->>'state' as state
      from customers order by last_order_at desc nulls last`)) as unknown as Record<string, unknown>[];
    csv = toCsv(
      ['Name', 'Phone', 'Email', 'Orders', 'Total spent', 'Last order', 'Tags', 'First seen', 'City', 'State'],
      rows.map((r) => [r.name, r.phone, r.email, r.orders_count, rupees(r.total_spent_paise), r.last_order_at, r.tags, r.created_at, r.city, r.state]),
    );
    name = `jhumka-customers-${stamp}.csv`;
  } else throw new HttpError(404, 'Unknown export.');

  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
});
