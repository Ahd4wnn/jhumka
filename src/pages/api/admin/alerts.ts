/** GET: recent alert deliveries · POST: send a test WhatsApp alert right now (owner only). */
import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { notifications } from '@/server/db/schema';
import { requireAdmin, requireOwner } from '@/server/admin/guard';
import { deliver } from '@/server/notify/outbox';
import { getSettings } from '@/server/settings';
import { handle, HttpError, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  const rows = await getDb()
    .select({ id: notifications.id, channel: notifications.channel, status: notifications.status, attempts: notifications.attempts, lastError: notifications.lastError, createdAt: notifications.createdAt, sentAt: notifications.sentAt, body: notifications.body })
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  return json({ notifications: rows });
});

export const POST: APIRoute = handle(async ({ locals }) => {
  requireOwner(locals);
  const { alerts } = await getSettings();
  try {
    await deliver('whatsapp', alerts.callmebotPhone, '✅ Jhumka test alert — new orders will arrive on this number like this.');
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : 'The alert could not be sent.');
  }
  return json({ ok: true });
});
