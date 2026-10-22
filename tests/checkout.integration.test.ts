/**
 * End-to-end order flow against the real `jhumka_test` database (TEST_DATABASE_URL), with the
 * Razorpay API replaced by a local fake. Skipped automatically when no test database is set.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, getSql, hasDatabase } from '@/server/db/client';
import { collections, coupons, customers, notifications, orders, products } from '@/server/db/schema';
import { changeStatus, createCheckout, markOrderPaid, reconcilePending, refundOrder } from '@/server/commerce/orders';
import { setRazorpayGateway, verifyPaymentSignature } from '@/server/commerce/razorpay';
import { DEFAULT_SETTINGS, saveSetting } from '@/server/settings';
import { env } from '@/server/env';
import { checkoutRequest } from '@/server/commerce/schemas';
import { dashboard, report } from '@/server/admin/reports';

const SECRET = 'integration_secret';
let rzpCounter = 0;
const refunds: { paymentId: string; amount: number }[] = [];
/** Payments the fake Razorpay reports per order, for the reconcile job. */
const captured = new Map<string, { id: string; method: string; status: string }[]>();

const address = { name: 'Priya S', phone: '+919876543210', line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' };
const checkout = (items: { slug: string; qty: number }[], couponCode?: string) =>
  createCheckout({ items, name: 'Priya S', phone: '+919876543210', email: 'priya@example.com', address, couponCode });
const sign = (orderId: string, paymentId: string) => createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

describe.skipIf(!hasDatabase())('checkout → payment → fulfilment', () => {
  let adminId: string;

  beforeAll(async () => {
    const db = getDb();
    await migrate(db, { migrationsFolder: 'drizzle' });
    await db.execute(sql`truncate notifications, order_events, order_items, orders, customers, coupons, products, collections, tasks, customer_notes, sessions, admin_users, settings restart identity cascade`);
    await db.execute(sql`alter sequence order_number_seq restart with 10001; alter sequence invoice_number_seq restart with 1`);

    const [col] = await db.insert(collections).values({ slug: 'infinity', name: 'Infinity' }).returning();
    await db.insert(products).values([
      { slug: 'infinity-necklace', name: 'Infinity Necklace', pricePaise: 34_900, stockQty: 2, collectionId: col.id, isPublished: true },
      { slug: 'tulip-necklace', name: 'Tulip Necklace', pricePaise: 37_900, stockQty: null, isPublished: true },
      { slug: 'draft-piece', name: 'Draft', pricePaise: 10_000, isPublished: false },
    ]);
    await db.insert(coupons).values({ code: 'WELCOME10', type: 'percent', value: 10, minOrderPaise: 0 });
    await saveSetting('shipping', { flatPaise: 6_000, freeAbovePaise: 100_000 });
    await saveSetting('alerts', { ...DEFAULT_SETTINGS.alerts, telegramEnabled: true, telegramBotToken: '1:x', telegramChatIds: '-1001' });
    const [admin] = (await db.execute(sql`insert into admin_users (email, name, password_hash, role) values ('owner@test', 'Owner', 'x', 'owner') returning id`)) as unknown as [{ id: string }];
    adminId = admin.id;
    // Ignore any real SMTP settings in .env: receipts are switched on only by the test that checks them.
    Object.assign(env, { SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined, MAIL_FROM: undefined });

    setRazorpayGateway({
      createOrder: async ({ amount }) => ({ id: `order_T${++rzpCounter}`, amount, currency: 'INR' }),
      fetchPayment: async (id) => ({ id, method: 'upi' }),
      fetchOrderPayments: async (orderId) => captured.get(orderId) ?? [],
      refund: async (paymentId, { amount }) => (refunds.push({ paymentId, amount }), { id: `rfnd_${refunds.length}`, amount }),
    });
  });

  afterAll(async () => {
    setRazorpayGateway(null);
    await getSql().end();
  });

  it('prices the order from the database, never from the browser', async () => {
    const { order } = await checkout([{ slug: 'infinity-necklace', qty: 1 }, { slug: 'tulip-necklace', qty: 1 }], 'welcome10');
    // 349 + 379 = 728; 10% = 72.80; shipping 60 (below ₹1000) → 715.20
    expect(order.subtotalPaise).toBe(72_800);
    expect(order.discountPaise).toBe(7_280);
    expect(order.shippingPaise).toBe(6_000);
    expect(order.totalPaise).toBe(71_520);
    expect(order.status).toBe('pending_payment');
    expect(order.number).toBe('JH-10001');
    expect(order.razorpayOrderId).toBe('order_T1');
  });

  it('refuses unpublished pieces and more than the stock', async () => {
    await expect(checkout([{ slug: 'draft-piece', qty: 1 }])).rejects.toMatchObject({ status: 409 });
    await expect(checkout([{ slug: 'infinity-necklace', qty: 3 }])).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a forged payment signature', () => {
    expect(verifyPaymentSignature('order_T1', 'pay_1', sign('order_T1', 'pay_OTHER'), SECRET)).toBe(false);
    expect(verifyPaymentSignature('order_T1', 'pay_1', sign('order_T1', 'pay_1'), SECRET)).toBe(true);
  });

  it('marks the order paid once — stock, coupon, customer and alert applied exactly once', async () => {
    const db = getDb();
    const first = await markOrderPaid({ razorpayOrderId: 'order_T1', paymentId: 'pay_1', signature: sign('order_T1', 'pay_1'), method: 'upi', source: 'checkout' });
    const again = await markOrderPaid({ razorpayOrderId: 'order_T1', paymentId: 'pay_1', method: 'upi', source: 'webhook' });
    expect(first.changed).toBe(true);
    expect(again.changed).toBe(false);
    expect(first.order.status).toBe('paid');
    expect(first.order.invoiceNo).toBe(1);

    const [p] = await db.select().from(products).where(eq(products.slug, 'infinity-necklace'));
    expect(p.stockQty).toBe(1);
    const [c] = await db.select().from(coupons).where(eq(coupons.code, 'WELCOME10'));
    expect(c.usedCount).toBe(1);
    const [cust] = await db.select().from(customers).where(eq(customers.phone, '+919876543210'));
    expect(cust.ordersCount).toBe(1);
    expect(cust.totalSpentPaise).toBe(71_520);
    const alerts = await db.select().from(notifications);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('JH-10001');
  });

  it('counts the paid order in reports and the dashboard', async () => {
    const now = Date.now();
    const sales = await report(new Date(now - 86_400_000), new Date(now + 86_400_000), 'day');
    expect(sales.totals).toMatchObject({ orders: 1, revenuePaise: 71_520, discountPaise: 7_280 });
    expect(sales.byProduct).toHaveLength(2);
    expect(sales.customers).toMatchObject({ newCustomers: 1, repeatOrders: 0 });
    const monthly = await report(new Date(now - 365 * 86_400_000), new Date(now + 86_400_000), 'month');
    expect(monthly.series).toHaveLength(1);
    const dash = await dashboard();
    expect(dash.periods.today).toMatchObject({ orders: 1, revenuePaise: 71_520 });
    expect(dash.toShip.paid).toBe(1);
  });

  it('returns stock when a paid order is cancelled', async () => {
    const db = getDb();
    const [order] = await db.select().from(orders).where(eq(orders.number, 'JH-10001'));
    await changeStatus(order.id, 'cancelled', adminId);
    const [p] = await db.select().from(products).where(eq(products.slug, 'infinity-necklace'));
    expect(p.stockQty).toBe(2);
    const [cust] = await db.select().from(customers).where(eq(customers.phone, '+919876543210'));
    expect(cust.ordersCount).toBe(0);
  });

  it('refunds through Razorpay and caps the amount', async () => {
    const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_2', source: 'webhook' });
    await expect(refundOrder(order.id, order.totalPaise + 1, adminId)).rejects.toMatchObject({ status: 400 });
    const partial = await refundOrder(order.id, 10_000, adminId, 'Scratched clasp');
    expect(partial.status).toBe('paid');
    const full = await refundOrder(order.id, order.totalPaise - 10_000, adminId);
    expect(full.status).toBe('refunded');
    expect(refunds.map((r) => r.amount)).toEqual([10_000, order.totalPaise - 10_000]);
  });

  const totals = async () => (await getDb().select().from(customers).where(eq(customers.phone, '+919876543210')))[0];

  it('lets only one of two simultaneous full refunds through', async () => {
    const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_3', source: 'webhook' });
    const before = refunds.length;
    const results = await Promise.allSettled([refundOrder(order.id, order.totalPaise, adminId), refundOrder(order.id, order.totalPaise, adminId)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(refunds.length - before).toBe(1);
  });

  it('takes a cancelled order out of the customer totals once, even after a full refund', async () => {
    const start = await totals();
    const { order: keep } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    const { order: cancel } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    await markOrderPaid({ razorpayOrderId: keep.razorpayOrderId!, paymentId: 'pay_4', source: 'webhook' });
    await markOrderPaid({ razorpayOrderId: cancel.razorpayOrderId!, paymentId: 'pay_5', source: 'webhook' });
    await changeStatus(cancel.id, 'cancelled', adminId);
    await refundOrder(cancel.id, cancel.totalPaise, adminId);
    expect(await totals()).toMatchObject({ ordersCount: start.ordersCount + 1, totalSpentPaise: start.totalSpentPaise + keep.totalPaise });
  });

  it('keeps a payment that arrives after the order was cancelled, alerts the owner, and allows a refund', async () => {
    const db = getDb();
    const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    await changeStatus(order.id, 'cancelled', adminId);
    const start = await totals();
    const late = await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_6', source: 'webhook' });
    expect(late.changed).toBe(false);
    expect(late.order).toMatchObject({ status: 'cancelled', razorpayPaymentId: 'pay_6' });
    const alerts = await db.select().from(notifications).where(eq(notifications.orderId, order.id));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('cancelled');
    expect((await refundOrder(order.id, order.totalPaise, adminId)).status).toBe('refunded');
    expect(await totals()).toMatchObject({ ordersCount: start.ordersCount, totalSpentPaise: start.totalSpentPaise });
  });

  it('marks an order paid when Razorpay has the payment but no callback or webhook arrived', async () => {
    const db = getDb();
    const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    captured.set(order.razorpayOrderId!, [{ id: 'pay_failed', method: 'card', status: 'failed' }, { id: 'pay_7', method: 'upi', status: 'captured' }]);
    expect(await reconcilePending()).toBe(1);
    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_7', paymentMethod: 'upi' });
    expect(await reconcilePending()).toBe(0);
  });

  it('sends the order alert to every Telegram chat once', async () => {
    const db = getDb();
    await saveSetting('alerts', { ...DEFAULT_SETTINGS.alerts, telegramEnabled: true, telegramBotToken: '1:x', telegramChatIds: '-1001, 42, -1001' });
    const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
    await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_8', source: 'webhook' });
    const rows = await db.select().from(notifications).where(eq(notifications.orderId, order.id));
    expect(rows.map((r) => `${r.channel}:${r.recipient}`).sort()).toEqual(['telegram:-1001', 'telegram:42']);
  });

  it('queues a receipt email for the customer when email is set up', async () => {
    const db = getDb();
    Object.assign(env, { SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'Jhumka <orders@test>' });
    try {
      const { order } = await checkout([{ slug: 'tulip-necklace', qty: 1 }]);
      await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_9', source: 'webhook' });
      const rows = await db.select().from(notifications).where(eq(notifications.orderId, order.id));
      expect(rows.filter((r) => r.channel === 'email').map((r) => r.recipient)).toEqual(['priya@example.com']);
    } finally {
      Object.assign(env, { SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined, MAIL_FROM: undefined });
    }
  });

  it('requires an email at checkout', () => {
    const base = { items: [{ slug: 'tulip-necklace', qty: 1 }], name: 'Priya S', phone: '9876543210', address: { line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' } };
    expect(checkoutRequest.safeParse(base).success).toBe(false);
    expect(checkoutRequest.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(checkoutRequest.safeParse({ ...base, email: ' Priya@Example.com ' }).data?.email).toBe('priya@example.com');
  });
});
