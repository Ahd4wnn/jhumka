/**
 * Razorpay webhook (Dashboard → Webhooks → https://<domain>/api/webhooks/razorpay, events:
 * payment.captured, order.paid, payment.failed, refund.processed). The signature is checked
 * against the raw body. Makes an order paid even if the customer closed the tab after paying.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { orders } from '@/server/db/schema';
import { addEvent, markOrderPaid, markPaymentFailed } from '@/server/commerce/orders';
import { verifyWebhookSignature } from '@/server/commerce/razorpay';
import { HttpError, json } from '@/server/http';

interface PaymentEntity {
  id: string;
  order_id?: string;
  method?: string;
  error_description?: string;
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(raw, signature)) return json({ error: 'Invalid signature' }, { status: 400 });

  let event: { event: string; payload?: { payment?: { entity: PaymentEntity }; refund?: { entity: { id: string; payment_id: string; amount: number } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad JSON' }, { status: 400 });
  }

  try {
    const payment = event.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
      await markOrderPaid({ razorpayOrderId: payment.order_id, paymentId: payment.id, method: payment.method, source: 'webhook' });
    } else if (event.event === 'payment.failed' && payment?.order_id) {
      await markPaymentFailed(payment.order_id, payment.error_description ?? 'Payment failed');
    } else if (event.event === 'refund.processed' && event.payload?.refund) {
      const r = event.payload.refund.entity;
      const db = getDb();
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.razorpayPaymentId, r.payment_id));
      if (order) await addEvent(db, order.id, 'refund', `Razorpay confirmed refund ₹${(r.amount / 100).toFixed(2)} (${r.id})`);
    }
  } catch (err) {
    console.error('[webhook]', event.event, err);
    // Unknown orders (e.g. test events) are acknowledged so Razorpay doesn't retry forever; anything
    // else (database down…) gets a 500 so Razorpay retries and a captured payment is never dropped.
    if (!(err instanceof HttpError && err.status === 404)) return json({ error: 'Temporary failure' }, { status: 500 });
  }
  return json({ ok: true });
};
