/**
 * Notification outbox: alerts are written to the database first, then delivered by the
 * background job with retries (1 min → 5 → 15 → 30 → 60 min), so a flaky provider never
 * loses an order alert and never slows down checkout.
 */
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { notifications } from '../db/schema';
import { getSettings } from '../settings';
import { sendCallMeBotWhatsApp } from './callmebot';
import { publish } from './live';

const BACKOFF_MIN = [1, 5, 15, 30, 60];
export const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

export async function enqueue(channel: 'whatsapp', recipient: string, body: string, orderId?: string) {
  await getDb().insert(notifications).values({ channel, recipient, body, orderId });
}

export async function deliver(channel: string, recipient: string, body: string) {
  if (channel !== 'whatsapp') throw new Error(`Unknown channel ${channel}`);
  const { alerts } = await getSettings();
  if (!alerts.callmebotApiKey) throw new Error('CallMeBot API key is not set (Admin → Settings → Alerts).');
  await sendCallMeBotWhatsApp(recipient, alerts.callmebotApiKey, body);
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
      .where(and(eq(notifications.status, 'pending'), lte(notifications.nextAttemptAt, new Date())))
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(limit);

    for (const n of due) {
      try {
        await deliver(n.channel, n.recipient, n.body);
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
        if (failed) publish({ type: 'notification.failed', message: `A WhatsApp alert could not be delivered: ${String(err).slice(0, 120)}` });
      }
    }
  } finally {
    running = false;
  }
}
