/** GET: chats the Telegram bot has seen, so the owner can pick the group instead of hunting for its id. */
import type { APIRoute } from 'astro';
import { requireOwner } from '@/server/admin/guard';
import { telegramChats } from '@/server/notify/telegram';
import { getSettings } from '@/server/settings';
import { handle, HttpError, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  requireOwner(locals);
  const { alerts } = await getSettings();
  if (!alerts.telegramBotToken) throw new HttpError(400, 'Save the bot token first.');
  try {
    return json({ chats: await telegramChats(alerts.telegramBotToken) });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : 'Telegram did not answer.');
  }
});
