/** Prices the bag (+ optional coupon) from the database for the bag drawer and checkout page. */
import type { APIRoute } from 'astro';
import { getDb } from '@/server/db/client';
import { quote } from '@/server/commerce/orders';
import { quoteRequest } from '@/server/commerce/schemas';
import { clientIp, handle, json, rateLimit, readJson } from '@/server/http';

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`quote:${clientIp(request, clientAddress)}`, 120, 60_000);
  const body = await readJson(request, quoteRequest);
  const q = await quote(getDb(), body.items, body.couponCode);
  return json({
    lines: q.lines.map((l) => ({ slug: l.slug, name: l.name, imagePath: l.imagePath, unitPricePaise: l.unitPricePaise, qty: l.qty, lineTotalPaise: l.lineTotalPaise })),
    issues: q.issues,
    totals: q.totals,
    coupon: q.coupon,
    couponError: q.couponError,
    freeShippingAbovePaise: q.shipping.freeAbovePaise,
  });
});
