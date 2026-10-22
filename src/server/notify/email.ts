/**
 * Customer receipts by email over SMTP (any provider: Brevo, Resend, Gmail…). Configured only through
 * env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, optional MAIL_REPLY_TO); without them
 * receipts are simply not sent. Delivery goes through the outbox, so a failed send is retried.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { orderItems, orders } from '../db/schema';
import { env } from '../env';
import { invoiceNumber, renderInvoice } from '../invoice';
import { getSettings, type StoreSettings } from '../settings';

type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;

export const hasMail = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM);

let transport: Transporter | null = null;
const mailer = () =>
  (transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  }));

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Subject, plain text and HTML of the order receipt (unit-tested). Customer-entered text is escaped. */
export function receiptEmail(order: Order, items: Pick<Item, 'name' | 'qty' | 'lineTotalPaise'>[], siteUrl: string, business: StoreSettings['business']) {
  const link = new URL(`/order/${order.number}?t=${order.accessToken}`, siteUrl).toString();
  const a = order.shippingAddress;
  const address = [a.name, a.line1, a.line2, a.landmark && `Near ${a.landmark}`, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean) as string[];
  const totals: [string, string][] = [
    ['Subtotal', rupees(order.subtotalPaise)],
    ...(order.discountPaise ? ([[`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `−${rupees(order.discountPaise)}`]] as [string, string][]) : []),
    ['Shipping', order.shippingPaise ? rupees(order.shippingPaise) : 'Free'],
    ['Paid', rupees(order.totalPaise)],
  ];
  const help = [business.email, business.phone].filter(Boolean).join(' · ');
  const first = order.name.split(/\s+/)[0];

  const text = [
    `Hi ${first},`,
    '',
    `Thank you for shopping with Jhumka. Your order ${order.number} is confirmed and we're getting it ready.`,
    '',
    ...items.map((i) => `${i.name} × ${i.qty} — ${rupees(i.lineTotalPaise)}`),
    '',
    ...totals.map(([k, v]) => `${k}: ${v}`),
    '',
    'Shipping to:',
    ...address,
    '',
    `Track your order: ${link}`,
    'Your invoice is attached.',
    ...(help ? ['', `Questions? ${help}`] : []),
  ].join('\n');

  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;${strong ? 'font-weight:600;' : ''}">${esc(k)}</td><td align="right" style="padding:6px 0;${strong ? 'font-weight:600;' : ''}">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1fb;font-family:Helvetica,Arial,sans-serif;color:#7D46AB">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1fb;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:32px">
<tr><td style="font-family:Georgia,serif;font-size:32px;padding-bottom:8px">jhumka</td></tr>
<tr><td style="font-size:12px;letter-spacing:2px;text-transform:uppercase;padding-bottom:24px">Order ${esc(order.number)} · confirmed</td></tr>
<tr><td style="font-size:16px;line-height:1.6;padding-bottom:24px">Hi ${esc(first)},<br>Thank you for shopping with Jhumka. Your order is confirmed and we're getting it ready.</td></tr>
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #e4d8ef">
${items.map((i) => row(`${i.name} × ${i.qty}`, rupees(i.lineTotalPaise))).join('')}
</table></td></tr>
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #e4d8ef;margin-top:8px">
${totals.map(([k, v], n) => row(k, v, n === totals.length - 1)).join('')}
</table></td></tr>
<tr><td style="font-size:14px;line-height:1.6;padding-top:20px"><strong style="font-weight:600">Shipping to</strong><br>${address.map(esc).join('<br>')}</td></tr>
<tr><td style="padding-top:28px"><a href="${esc(link)}" style="display:inline-block;background:#7D46AB;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 28px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase">Track your order</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;padding-top:24px">Your invoice is attached.${help ? `<br>Questions? ${esc(help)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `Your Jhumka order ${order.number} is confirmed`, text, html };
}

/** Sends the receipt (with the invoice PDF) for one paid order. Called by the outbox. */
export async function sendReceipt(orderId: string, to: string) {
  if (!hasMail()) throw new Error('Email is not set up (SMTP_* and MAIL_FROM in the server env).');
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error('Order not found for receipt.');
  const [items, settings] = await Promise.all([db.select().from(orderItems).where(eq(orderItems.orderId, order.id)), getSettings()]);
  const { subject, text, html } = receiptEmail(order, items, env.PUBLIC_SITE_URL, settings.business);
  const invoice = invoiceNumber(order, settings.invoice.prefix).replace(/[^\w-]+/g, '-');
  await mailer().sendMail({
    from: env.MAIL_FROM,
    replyTo: env.MAIL_REPLY_TO || undefined,
    to,
    subject,
    text,
    html,
    attachments: [{ filename: `${invoice}.pdf`, content: await renderInvoice(order, items, settings), contentType: 'application/pdf' }],
  });
}
