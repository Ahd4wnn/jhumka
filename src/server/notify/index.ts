/** Owner alerts for a new paid order: WhatsApp (via the outbox) + live admin event. */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { orderItems, type orders } from '../db/schema';
import { env } from '../env';
import { getSettings } from '../settings';
import { enqueue } from './outbox';
import { publish } from './live';

type Order = typeof orders.$inferSelect;

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0 })}`;

/** Plain-text WhatsApp alert (unit-tested). */
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

export async function notifyNewOrder(order: Order) {
  const [settings, items] = await Promise.all([
    getSettings(),
    getDb().select({ name: orderItems.name, qty: orderItems.qty }).from(orderItems).where(eq(orderItems.orderId, order.id)),
  ]);
  publish({ type: 'order.paid', orderNumber: order.number, totalPaise: order.totalPaise, customerName: order.name, message: `New order ${order.number} · ${rupees(order.totalPaise)}` });
  if (settings.alerts.whatsappEnabled && settings.alerts.callmebotPhone) {
    await enqueue('whatsapp', settings.alerts.callmebotPhone, orderAlertText(order, items, env.PUBLIC_SITE_URL), order.id);
  }
}
