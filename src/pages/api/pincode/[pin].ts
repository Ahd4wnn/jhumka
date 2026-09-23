/** Pincode → city/state via the free India Post API (proxied and cached to avoid CORS/rate issues). */
import type { APIRoute } from 'astro';
import { isPincode } from '@/server/commerce/pricing';
import { json } from '@/server/http';

const cache = new Map<string, { city: string; state: string } | null>();

export const GET: APIRoute = async ({ params }) => {
  const pin = params.pin ?? '';
  if (!isPincode(pin)) return json({ error: 'Invalid pincode' }, { status: 400 });
  if (!cache.has(pin)) {
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as [{ Status: string; PostOffice?: { District: string; State: string }[] }];
      const po = data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : undefined;
      cache.set(pin, po ? { city: po.District, state: po.State } : null);
    } catch {
      return json({ found: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }
  const hit = cache.get(pin);
  return json(hit ? { found: true, ...hit } : { found: false }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
};
