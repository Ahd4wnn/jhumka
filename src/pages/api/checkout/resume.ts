/** Re-opens payment for an unpaid order (Try again / recovery link). Requires the order's secret token. */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { orders } from '@/server/db/schema';
import { ensureRazorpayOrder, markPaymentFailed } from '@/server/commerce/orders';
import { env } from '@/server/env';
import { clientIp, handle, HttpError, json, rateLimit, readJson } from '@/server/http';

const body = z.object({
  number: z.string().max(20),
  token: z.string().min(10).max(64),
  /** Set when the Razorpay modal reports a failure, so the order shows as "payment failed". */
  failed: z.string().max(300).optional(),
});

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`resume:${clientIp(request, clientAddress)}`, 30, 10 * 60_000);
  const b = await readJson(request, body);
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.number, b.number), eq(orders.accessToken, b.token)));
  if (!order) throw new HttpError(404, 'We could not find that order.');
  if (b.failed && order.razorpayOrderId) {
    await markPaymentFailed(order.razorpayOrderId, b.failed);
    return json({ ok: true });
  }
  if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
    return json({ paid: true, redirect: `/order/${order.number}?t=${order.accessToken}` });
  }
  const ready = await ensureRazorpayOrder(order);
  return json({
    keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: ready.razorpayOrderId,
    amount: ready.totalPaise,
    currency: 'INR',
    orderNumber: ready.number,
    prefill: { name: ready.name, email: ready.email ?? '', contact: ready.phone },
  });
});
