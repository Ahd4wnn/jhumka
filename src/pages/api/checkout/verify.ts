/**
 * Razorpay Checkout success handler. The signature proves the payment belongs to our order;
 * the order is then marked paid (idempotently — the webhook may already have done it).
 */
import type { APIRoute } from 'astro';
import { markOrderPaid } from '@/server/commerce/orders';
import { getRazorpay, verifyPaymentSignature } from '@/server/commerce/razorpay';
import { verifyRequest } from '@/server/commerce/schemas';
import { clientIp, handle, HttpError, json, rateLimit, readJson } from '@/server/http';

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`verify:${clientIp(request, clientAddress)}`, 30, 10 * 60_000);
  const body = await readJson(request, verifyRequest);
  if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    throw new HttpError(400, 'We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded.');
  }
  const method = await getRazorpay()
    .fetchPayment(body.razorpay_payment_id)
    .then((p) => p.method)
    .catch(() => undefined);
  const { order } = await markOrderPaid({
    razorpayOrderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
    method,
    source: 'checkout',
  });
  return json({ ok: true, orderNumber: order.number, redirect: `/order/${order.number}?t=${order.accessToken}` });
});
