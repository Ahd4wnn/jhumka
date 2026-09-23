/** Creates a pending order + Razorpay order and returns what Razorpay Checkout needs. */
import type { APIRoute } from 'astro';
import { createCheckout } from '@/server/commerce/orders';
import { hasRazorpay } from '@/server/commerce/razorpay';
import { checkoutRequest } from '@/server/commerce/schemas';
import { env } from '@/server/env';
import { clientIp, handle, HttpError, json, rateLimit, readJson } from '@/server/http';

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`checkout:${clientIp(request, clientAddress)}`, 15, 10 * 60_000);
  if (!hasRazorpay()) throw new HttpError(503, 'Online payments are not set up yet. Please try again soon.');
  const body = await readJson(request, checkoutRequest);
  const { order } = await createCheckout({
    items: body.items,
    name: body.name,
    phone: body.phone,
    email: body.email,
    address: { name: body.name, phone: body.phone, ...body.address },
    note: body.note,
    couponCode: body.couponCode,
    utm: body.utm,
  });
  return json({
    keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: order.razorpayOrderId,
    amount: order.totalPaise,
    currency: 'INR',
    orderNumber: order.number,
    // Lets this browser retry payment or open the confirmation page for its own order.
    token: order.accessToken,
    prefill: { name: order.name, email: order.email ?? '', contact: order.phone },
  });
});
