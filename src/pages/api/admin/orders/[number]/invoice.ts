import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { orderItems, orders } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { invoiceNumber, renderInvoice } from '@/server/invoice';
import { getSettings } from '@/server/settings';
import { handle, HttpError } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.number, (params.number ?? '').toUpperCase()));
  if (!order) throw new HttpError(404, 'Order not found.');
  if (!order.invoiceNo) throw new HttpError(409, 'Invoices are created once an order is paid.');
  const [items, settings] = await Promise.all([db.select().from(orderItems).where(eq(orderItems.orderId, order.id)), getSettings()]);
  const pdf = await renderInvoice(order, items, settings);
  const name = invoiceNumber(order, settings.invoice.prefix).replace(/[^\w-]+/g, '-');
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}.pdf"`, 'Cache-Control': 'no-store' },
  });
});
