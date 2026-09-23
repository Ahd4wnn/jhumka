/**
 * Instagram feed connection. GET: status. POST { action: 'connect', token } | { action: 'sync' } |
 * { action: 'disconnect' }. Connecting and disconnecting are owner-only; the token is never returned.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, requireOwner } from '@/server/admin/guard';
import { connectInstagram, disconnectInstagram, InstagramError, instagramStatus, syncInstagram } from '@/server/instagram';
import { handle, HttpError, json, rateLimit, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json(await instagramStatus());
});

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), token: z.string().trim().min(20, 'Paste the whole access token.').max(1000) }),
  z.object({ action: z.literal('sync') }),
  z.object({ action: z.literal('disconnect') }),
]);

export const POST: APIRoute = handle(async ({ locals, request }) => {
  const admin = requireAdmin(locals);
  const input = await readJson(request, body);
  rateLimit(`instagram:${admin.id}`, 10, 10 * 60_000);
  try {
    if (input.action === 'connect') {
      requireOwner(locals);
      const result = await connectInstagram(input.token);
      return json({ ...(await instagramStatus()), result });
    }
    if (input.action === 'disconnect') {
      requireOwner(locals);
      await disconnectInstagram();
      return json(await instagramStatus());
    }
    const result = await syncInstagram();
    return json({ ...(await instagramStatus()), result });
  } catch (err) {
    if (err instanceof InstagramError) throw new HttpError(400, err.message);
    throw err;
  }
});
