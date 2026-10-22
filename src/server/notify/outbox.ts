/**
 * Notification outbox: alerts are written to the database first, then delivered by the
 * background job with retries (1 min → 5 → 15 → 30 → 60 min), so a flaky provider never
 * loses an order alert and never slows down checkout.
 */
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { notifications } from '../db/schema';
import { getSettings } from '../settings';
import { sendReceipt } from './email';
import { sendTelegram } from './telegram';
import { publish } from './live';

const BACKOFF_MIN = [1, 5, 15, 30, 60];
export const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

export type Channel = 'telegram' | 'email';
const CHANNEL_NAME: Record<Channel, string> = { telegram: 'A Telegram alert', email: 'A receipt email' };

export async function enqueue(channel: Channel, recipient: string, body: string, orderId?: string) {
  await getDb().insert(notifications).values({ channel, recipient, body, orderId });
}

/** `orderId` is required for 'email' (the receipt is rendered from the order at send time). */
export async function deliver(channel: string, recipient: string, body: string, orderId?: string | null) {
  if (channel === 'email') return sendReceipt(orderId!, recipient);
  if (channel !== 'telegram') throw new Error(`Unknown channel ${channel}`);
  const { alerts } = await getSettings();
  if (!alerts.telegramBotToken) throw new Error('Telegram bot token is not set (Admin → Settings → Alerts).');
  await sendTelegram(alerts.telegramBotToken, recipient, body);
}

let running = false;

/** Sends due notifications. Safe to call often; overlapping runs are skipped. */
export async function processOutbox(limit = 10) {
  if (running) return;
  running = true;
  try {
    const db = getDb();
    const due = await db
      .select()
      .from(notifications)
      // Rows from the removed WhatsApp channel stay as history instead of failing.
      .where(and(eq(notifications.status, 'pending'), inArray(notifications.channel, ['telegram', 'email']), lte(notifications.nextAttemptAt, new Date())))
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(limit);

    for (const n of due) {
      try {
        await deliver(n.channel, n.recipient, n.body, n.orderId);
        await db
          .update(notifications)
          .set({ status: 'sent', sentAt: new Date(), attempts: sql`${notifications.attempts} + 1`, lastError: null })
          .where(eq(notifications.id, n.id));
      } catch (err) {
        const attempts = n.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        const delay = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000;
        await db
          .update(notifications)
          .set({
            attempts,
            status: failed ? 'failed' : 'pending',
            lastError: String(err instanceof Error ? err.message : err).slice(0, 500),
            nextAttemptAt: new Date(Date.now() + delay),
          })
          .where(eq(notifications.id, n.id));
        if (failed) publish({ type: 'notification.failed', message: `${CHANNEL_NAME[n.channel as Channel] ?? n.channel} could not be delivered: ${String(err).slice(0, 120)}` });
      }
    }
  } finally {
    running = false;
  }
}
