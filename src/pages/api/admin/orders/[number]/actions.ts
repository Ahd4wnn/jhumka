/**
 * Order actions: { action: 'status', to, courier?, trackingNumber?, trackingUrl?, note? }
 *              | { action: 'refund', amountPaise, reason? }
 *              | { action: 'note', body }
 *              | { action: 'contacted' }   (abandoned-checkout follow-up)
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { orders } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { addEvent, changeStatus, refundOrder } from '@/server/commerce/orders';
import { ORDER_STATUSES } from '@/server/commerce/status';
import { handle, HttpError, json, readJson } from '@/server/http';

const url = z.url().trim().max(300).nullish();
const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    to: z.enum(ORDER_STATUSES),
    courier: z.string().trim().max(60).nullish(),
    trackingNumber: z.string().trim().max(60).nullish(),
    trackingUrl: url,
    note: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal('refund'), amountPaise: z.number().int().positive(), reason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal('note'), body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('contacted') }),
]);

export const POST: APIRoute = handle(async ({ locals, request, params }) => {
  const admin = requireAdmin(locals);
  const input = await readJson(request, body);
  const db = getDb();
  const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.number, (params.number ?? '').toUpperCase()));
  if (!order) throw new HttpError(404, 'Order not found.');

  switch (input.action) {
    case 'status':
      await changeStatus(order.id, input.to, admin.id, input);
      break;
    case 'refund':
      await refundOrder(order.id, input.amountPaise, admin.id, input.reason);
      break;
    case 'note':
      await addEvent(db, order.id, 'note', input.body, null, admin.id);
      break;
    case 'contacted':
      await db.update(orders).set({ recoveryContactedAt: new Date() }).where(eq(orders.id, order.id));
      await addEvent(db, order.id, 'note', 'Customer contacted about their unfinished checkout', null, admin.id);
      break;
  }
  return json({ ok: true });
});
