/**
 * Order service: checkout creation, the idempotent "mark paid" transition shared by the
 * checkout callback and the Razorpay webhook, failures, admin status changes and refunds.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb, type DB } from '../db/client';
import { coupons, customers, orderEvents, orderItems, orders, products, type Address } from '../db/schema';
import { HttpError } from '../http';
import { notifyLatePayment, notifyNewOrder } from '../notify';
import { getSettings } from '../settings';
import { priceCart, type CartInput, type CartIssue } from './cart';
import { computeTotals, couponDiscount, MIN_ORDER_PAISE, type CouponRule } from './pricing';
import { getRazorpay } from './razorpay';
import { canTransition, SALE_STATUSES, type OrderStatus } from './status';

export type Order = typeof orders.$inferSelect;

export interface CheckoutInput {
  items: CartInput[];
  name: string;
  phone: string; // normalised +91…
  email: string | null;
  address: Address;
  note?: string;
  couponCode?: string;
  utm?: Record<string, string>;
}

export async function findCoupon(db: DB, code: string | undefined): Promise<CouponRule | null> {
  if (!code?.trim()) return null;
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code.trim()));
  return c ?? null;
}

/** Prices a cart + coupon exactly like checkout will (used by the checkout page preview). */
export async function quote(db: DB, items: CartInput[], couponCode?: string) {
  const [{ lines, issues }, settings, coupon] = await Promise.all([priceCart(db, items), getSettings(), findCoupon(db, couponCode)]);
  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  let discount = 0;
  let couponError: string | null = null;
  if (couponCode?.trim()) {
    if (!coupon) couponError = 'That code is not valid.';
    else {
      const r = couponDiscount(subtotal, coupon);
      if (r.ok) discount = r.discountPaise;
      else couponError = r.reason;
    }
  }
  const totals = computeTotals(lines, discount, settings.shipping);
  return { lines, issues, totals, coupon: coupon && !couponError ? coupon.code : null, couponError, shipping: settings.shipping };
}

async function addEvent(db: DB, orderId: string, type: string, message: string, data?: unknown, actorId?: string) {
  await db.insert(orderEvents).values({ orderId, type, message, data: data ?? null, actorId: actorId ?? null });
}

/** Creates (or refreshes) the customer, a pending order and its Razorpay order. */
export async function createCheckout(input: CheckoutInput): Promise<{ order: Order; issues: CartIssue[] }> {
  const db = getDb();
  const q = await quote(db, input.items, input.couponCode);
  if (!q.lines.length) throw new HttpError(409, 'Your bag is empty or its pieces are no longer available.', { issues: q.issues });
  if (q.issues.length) throw new HttpError(409, 'Some pieces in your bag changed. Please review your bag.', { issues: q.issues });
  if (q.couponError) throw new HttpError(400, q.couponError, { fields: { couponCode: q.couponError } });
  if (q.totals.totalPaise < MIN_ORDER_PAISE) throw new HttpError(400, 'The order total is too low to pay online.');

  const order = await db.transaction(async (tx) => {
    const [customer] = await tx
      .insert(customers)
      .values({ name: input.name, phone: input.phone, email: input.email, defaultAddress: input.address })
      .onConflictDoUpdate({
        target: customers.phone,
        set: { name: input.name, email: sql`coalesce(${input.email}, ${customers.email})`, defaultAddress: input.address },
      })
      .returning({ id: customers.id });

    const [{ n }] = (await tx.execute(sql`select nextval('order_number_seq')::int as n`)) as unknown as [{ n: number }];
    const [created] = await tx
      .insert(orders)
      .values({
        number: `JH-${n}`,
        accessToken: randomBytes(24).toString('base64url'),
        customerId: customer.id,
        name: input.name,
        phone: input.phone,
        email: input.email,
        shippingAddress: input.address,
        customerNote: input.note?.trim() || null,
        ...q.totals,
        couponCode: q.coupon,
        utm: input.utm && Object.keys(input.utm).length ? input.utm : null,
      })
      .returning();

    await tx.insert(orderItems).values(
      q.lines.map((l) => ({
        orderId: created.id,
        productId: l.productId,
        slug: l.slug,
        name: l.name,
        imagePath: l.imagePath,
        unitPricePaise: l.unitPricePaise,
        qty: l.qty,
        lineTotalPaise: l.lineTotalPaise,
      })),
    );
    await addEvent(tx as unknown as DB, created.id, 'system', 'Checkout started', { items: q.lines.length, total: q.totals.totalPaise });
    return created;
  });

  const rzp = await getRazorpay().createOrder({
    amount: order.totalPaise,
    receipt: order.number,
    notes: { order_number: order.number, phone: order.phone },
  });
  const [withRzp] = await db.update(orders).set({ razorpayOrderId: rzp.id }).where(eq(orders.id, order.id)).returning();
  return { order: withRzp, issues: [] };
}

/** A Razorpay order for an existing unpaid order (retry / recovery link). */
export async function ensureRazorpayOrder(order: Order): Promise<Order> {
  if (order.razorpayOrderId) return order;
  const rzp = await getRazorpay().createOrder({ amount: order.totalPaise, receipt: order.number, notes: { order_number: order.number } });
  const [updated] = await getDb().update(orders).set({ razorpayOrderId: rzp.id }).where(eq(orders.id, order.id)).returning();
  return updated;
}

export interface PaidResult {
  order: Order;
  /** False when the order had already been marked paid (duplicate callback/webhook). */
  changed: boolean;
}

/**
 * The single path to "paid". Idempotent: the checkout callback and the webhook may both call
 * it, in any order, any number of times — stock, coupons and alerts are only applied once.
 */
export async function markOrderPaid(args: { razorpayOrderId: string; paymentId: string; signature?: string; method?: string; source: 'checkout' | 'webhook' | 'reconcile' }): Promise<PaidResult> {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.razorpayOrderId, args.razorpayOrderId)).for('update');
    if (!order) throw new HttpError(404, 'Order not found for this payment.');
    if (order.status === 'cancelled' && !order.razorpayPaymentId) {
      // Paid after it was cancelled (e.g. a payment page left open): keep the payment so the owner can refund it.
      const [kept] = await tx
        .update(orders)
        .set({ paidAt: new Date(), razorpayPaymentId: args.paymentId, paymentMethod: args.method ?? order.paymentMethod })
        .where(eq(orders.id, order.id))
        .returning();
      await addEvent(tx as unknown as DB, order.id, 'payment', `Payment received after the order was cancelled (${args.source}). Refund it, or contact the customer.`, {
        paymentId: args.paymentId,
        method: args.method ?? null,
      });
      return { order: kept, changed: false, late: true };
    }
    if (order.status !== 'pending_payment' && order.status !== 'payment_failed') return { order, changed: false };

    // Take the pieces out of stock. If another buyer paid for the last one first, flag it for the owner.
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const oversold: string[] = [];
    for (const item of items) {
      if (!item.productId) continue;
      const [p] = await tx
        .select({ name: products.name, stockQty: products.stockQty })
        .from(products)
        .where(eq(products.id, item.productId))
        .for('update');
      if (!p || p.stockQty == null) continue;
      if (p.stockQty < item.qty) oversold.push(`${p.name} (had ${p.stockQty}, ordered ${item.qty})`);
      await tx
        .update(products)
        .set({ stockQty: Math.max(p.stockQty - item.qty, 0) })
        .where(eq(products.id, item.productId));
    }

    if (order.couponCode) {
      await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, order.couponCode));
    }
    const [{ inv }] = (await tx.execute(sql`select nextval('invoice_number_seq')::int as inv`)) as unknown as [{ inv: number }];
    const now = new Date();
    const [paid] = await tx
      .update(orders)
      .set({
        status: 'paid',
        paidAt: now,
        razorpayPaymentId: args.paymentId,
        razorpaySignature: args.signature ?? order.razorpaySignature,
        paymentMethod: args.method ?? order.paymentMethod,
        invoiceNo: inv,
      })
      .where(eq(orders.id, order.id))
      .returning();

    if (order.customerId) {
      await tx
        .update(customers)
        .set({
          ordersCount: sql`${customers.ordersCount} + 1`,
          totalSpentPaise: sql`${customers.totalSpentPaise} + ${order.totalPaise}`,
          lastOrderAt: now,
        })
        .where(eq(customers.id, order.customerId));
    }
    await addEvent(tx as unknown as DB, order.id, 'payment', `Payment received via Razorpay (${args.source})`, {
      paymentId: args.paymentId,
      method: args.method ?? null,
    });
    if (oversold.length) {
      await addEvent(tx as unknown as DB, order.id, 'system', `Stock was short: ${oversold.join(', ')}. Confirm availability before packing.`);
    }
    return { order: paid, changed: true };
  });

  if (result.changed) {
    invalidateCatalog();
    await notifyNewOrder(result.order).catch((err) => console.error('[notify]', err));
  }
  if (result.late) await notifyLatePayment(result.order).catch((err) => console.error('[notify]', err));
  return result;
}

export async function markPaymentFailed(razorpayOrderId: string, reason: string) {
  const db = getDb();
  const [order] = await db
    .update(orders)
    .set({ status: 'payment_failed' })
    .where(and(eq(orders.razorpayOrderId, razorpayOrderId), eq(orders.status, 'pending_payment')))
    .returning();
  if (order) await addEvent(db, order.id, 'payment', `Payment failed: ${reason.slice(0, 200)}`);
}

const STAMP: Partial<Record<OrderStatus, 'packedAt' | 'shippedAt' | 'deliveredAt' | 'cancelledAt'>> = {
  packed: 'packedAt',
  shipped: 'shippedAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
};

export async function changeStatus(
  orderId: string,
  to: OrderStatus,
  actorId: string,
  extra: { courier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; note?: string } = {},
): Promise<Order> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status === to && to !== 'shipped') return order;
    if (order.status !== to && !canTransition(order.status, to)) throw new HttpError(409, `An order that is "${order.status}" can't be moved to "${to}".`);

    const stamp = STAMP[to];
    const [updated] = await tx
      .update(orders)
      .set({
        status: to,
        ...(stamp ? { [stamp]: new Date() } : {}),
        ...(to === 'shipped'
          ? { courier: extra.courier ?? order.courier, trackingNumber: extra.trackingNumber ?? order.trackingNumber, trackingUrl: extra.trackingUrl ?? order.trackingUrl }
          : {}),
      })
      .where(eq(orders.id, orderId))
      .returning();

    // Cancelling a paid order returns its pieces to stock and removes it from the customer's totals.
    if (to === 'cancelled' && ['paid', 'packed'].includes(order.status)) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      for (const i of items) {
        if (i.productId) {
          await tx
            .update(products)
            .set({ stockQty: sql`${products.stockQty} + ${i.qty}` })
            .where(and(eq(products.id, i.productId), sql`${products.stockQty} is not null`));
        }
      }
      if (order.customerId) {
        await tx
          .update(customers)
          .set({ ordersCount: sql`greatest(${customers.ordersCount} - 1, 0)`, totalSpentPaise: sql`greatest(${customers.totalSpentPaise} - ${order.totalPaise}, 0)` })
          .where(eq(customers.id, order.customerId));
      }
    }

    const shippedNote = to === 'shipped' && (extra.courier || extra.trackingNumber) ? ` · ${[extra.courier, extra.trackingNumber].filter(Boolean).join(' ')}` : '';
    await addEvent(tx as unknown as DB, orderId, 'status', `${order.status} → ${to}${shippedNote}${extra.note ? ` · ${extra.note}` : ''}`, null, actorId);
    return updated;
  });
}

/** Full or partial refund through Razorpay. Fully refunded orders move to "refunded". */
export async function refundOrder(orderId: string, amountPaise: number, actorId: string, reason?: string): Promise<Order> {
  // The order row stays locked from the amount check to the update, so a double-clicked or
  // simultaneous refund waits here and is then checked against the first one's amount.
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new HttpError(404, 'Order not found.');
    if (!order.razorpayPaymentId || !order.paidAt) throw new HttpError(409, 'Only paid orders can be refunded.');
    const refundable = order.totalPaise - order.refundedPaise;
    if (amountPaise <= 0 || amountPaise > refundable) throw new HttpError(400, `You can refund up to ₹${(refundable / 100).toFixed(2)}.`);

    const refund = await getRazorpay().refund(order.razorpayPaymentId, { amount: amountPaise, notes: { order_number: order.number, reason: reason ?? '' } });
    // ponytail: if the save below failed after Razorpay accepted, the refund is only visible via the
    // refund.processed webhook event in the order timeline; fine at this volume.
    const full = order.refundedPaise + amountPaise >= order.totalPaise;
    const [updated] = await tx
      .update(orders)
      .set({ refundedPaise: order.refundedPaise + amountPaise, ...(full ? { status: 'refunded' as const } : {}) })
      .where(eq(orders.id, orderId))
      .returning();
    await addEvent(tx as unknown as DB, orderId, 'refund', `Refunded ₹${(amountPaise / 100).toFixed(2)}${full ? ' (full)' : ''}${reason ? ` · ${reason}` : ''}`, { refundId: refund.id }, actorId);
    // Only a live sale is in the customer's totals: a cancelled order was already taken out.
    if (full && order.customerId && SALE_STATUSES.includes(order.status)) {
      await tx
        .update(customers)
        .set({ ordersCount: sql`greatest(${customers.ordersCount} - 1, 0)`, totalSpentPaise: sql`greatest(${customers.totalSpentPaise} - ${order.totalPaise}, 0)` })
        .where(eq(customers.id, order.customerId));
    }
    return updated;
  });
}

/**
 * Safety net for "paid but the order still says unpaid": asks Razorpay about recent unpaid orders
 * and marks any with a captured payment as paid. Covers a closed tab plus a missing or broken webhook.
 */
export async function reconcilePending(limit = 20): Promise<number> {
  const unpaid = await getDb()
    .select({ razorpayOrderId: orders.razorpayOrderId })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ['pending_payment', 'payment_failed']),
        isNotNull(orders.razorpayOrderId),
        gt(orders.createdAt, new Date(Date.now() - 3 * 86_400_000)),
      ),
    )
    .orderBy(orders.createdAt)
    .limit(limit);
  let paid = 0;
  for (const { razorpayOrderId } of unpaid) {
    // One bad order (e.g. a test-mode id after switching to live keys) must not block the rest.
    const payments = await getRazorpay()
      .fetchOrderPayments(razorpayOrderId!)
      .catch((err) => (console.error('[reconcile]', razorpayOrderId, err), []));
    const captured = payments.find((p) => p.status === 'captured');
    if (!captured) continue;
    const r = await markOrderPaid({ razorpayOrderId: razorpayOrderId!, paymentId: captured.id, method: captured.method, source: 'reconcile' });
    if (r.changed) paid++;
  }
  return paid;
}

export { addEvent };
