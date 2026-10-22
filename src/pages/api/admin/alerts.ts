/** GET: recent alert deliveries · POST: send a test Telegram alert right now (owner only). */
import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { notifications } from '@/server/db/schema';
import { requireAdmin, requireOwner } from '@/server/admin/guard';
import { telegramChatIds } from '@/server/notify';
import { deliver } from '@/server/notify/outbox';
import { getSettings } from '@/server/settings';
import { handle, HttpError, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  const rows = await getDb()
    .select({ id: notifications.id, channel: notifications.channel, status: notifications.status, attempts: notifications.attempts, lastError: notifications.lastError, createdAt: notifications.createdAt, sentAt: notifications.sentAt, body: notifications.body })
    .from(notifications)
    .where(eq(notifications.channel, 'telegram'))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  return json({ notifications: rows });
});

export const POST: APIRoute = handle(async ({ locals }) => {
  requireOwner(locals);
  const { alerts } = await getSettings();
  const recipients = telegramChatIds(alerts.telegramChatIds);
  if (!recipients.length) throw new HttpError(400, 'Add a chat id first.');
  try {
    for (const to of recipients) await deliver('telegram', to, '✅ Jhumka test alert — new orders will arrive here like this.');
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : 'The alert could not be sent.');
  }
  return json({ ok: true });
});
