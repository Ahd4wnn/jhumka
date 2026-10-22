/** A new paid order: Telegram alert to the founders, receipt email to the customer (both via the outbox) + live admin event. */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { orderItems, type orders } from '../db/schema';
import { env } from '../env';
import { getSettings } from '../settings';
import { hasMail } from './email';
import { enqueue } from './outbox';
import { publish } from './live';

type Order = typeof orders.$inferSelect;

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0 })}`;
const adminUrl = (number: string) => new URL(`/admin/orders/${number}`, env.PUBLIC_SITE_URL).toString();

/** Plain-text order alert for Telegram (unit-tested). */
export function orderAlertText(order: Pick<Order, 'number' | 'totalPaise' | 'name' | 'phone' | 'shippingAddress' | 'couponCode'>, items: { name: string; qty: number }[], siteUrl: string): string {
  const a = order.shippingAddress;
  const lines = items.map((i) => `• ${i.name} × ${i.qty}`);
  return [
    `🛍️ New Jhumka order ${order.number}`,
    `${rupees(order.totalPaise)} paid online${order.couponCode ? ` (code ${order.couponCode})` : ''}`,
    '',
    ...lines,
    '',
    `${order.name} · ${order.phone}`,
    `${a.city}, ${a.state} ${a.pincode}`,
    '',
    `Open: ${new URL(`/admin/orders/${order.number}`, siteUrl).toString()}`,
  ].join('\n');
}

/** Queues one alert per Telegram chat; the outbox delivers and retries them. */
async function alertOwners(text: string, orderId: string) {
  const { alerts } = await getSettings();
  if (alerts.telegramEnabled && alerts.telegramBotToken) {
    for (const chatId of telegramChatIds(alerts.telegramChatIds)) await enqueue('telegram', chatId, text, orderId);
  }
}

export const telegramChatIds = (list: string) => [...new Set(list.split(/[\s,]+/).filter(Boolean))];

export async function notifyNewOrder(order: Order) {
  const items = await getDb().select({ name: orderItems.name, qty: orderItems.qty }).from(orderItems).where(eq(orderItems.orderId, order.id));
  publish({ type: 'order.paid', orderNumber: order.number, totalPaise: order.totalPaise, customerName: order.name, message: `New order ${order.number} · ${rupees(order.totalPaise)}` });
  await alertOwners(orderAlertText(order, items, env.PUBLIC_SITE_URL), order.id);
  if (order.email && hasMail()) await enqueue('email', order.email, `Receipt for ${order.number}`, order.id);
}

/** A payment that arrived after the order was cancelled: the owner has to refund it. */
export async function notifyLatePayment(order: Order) {
  const message = `Payment of ${rupees(order.totalPaise)} received for cancelled order ${order.number}. Refund it, or contact the customer.`;
  publish({ type: 'order.updated', orderNumber: order.number, totalPaise: order.totalPaise, customerName: order.name, message });
  await alertOwners(`⚠️ ${message}\n\n${order.name} · ${order.phone}\nOpen: ${adminUrl(order.number)}`, order.id);
}
