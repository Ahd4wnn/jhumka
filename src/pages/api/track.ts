/** Public order tracking: order number + the phone used at checkout. */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { orders } from '@/server/db/schema';
import { trackRequest } from '@/server/commerce/schemas';
import { clientIp, handle, HttpError, json, rateLimit, readJson } from '@/server/http';

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`track:${clientIp(request, clientAddress)}`, 20, 10 * 60_000);
  const b = await readJson(request, trackRequest);
  const number = b.number.toUpperCase().startsWith('JH-') ? b.number.toUpperCase() : `JH-${b.number.replace(/\D/g, '')}`;
  const [order] = await getDb()
    .select({ number: orders.number, token: orders.accessToken })
    .from(orders)
    .where(and(eq(orders.number, number), eq(orders.phone, b.phone)));
  if (!order) throw new HttpError(404, 'We could not find an order with that number and phone.');
  return json({ redirect: `/order/${order.number}?t=${order.token}` });
});
