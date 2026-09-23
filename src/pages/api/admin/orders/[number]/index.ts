import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { adminUsers, customers, orderEvents, orderItems, orders } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { nextStatuses } from '@/server/commerce/status';
import { handle, HttpError, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.number, (params.number ?? '').toUpperCase()));
  if (!order) throw new HttpError(404, 'Order not found.');
  const [items, events, customer] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db
      .select({ id: orderEvents.id, type: orderEvents.type, message: orderEvents.message, createdAt: orderEvents.createdAt, actor: adminUsers.name })
      .from(orderEvents)
      .leftJoin(adminUsers, eq(adminUsers.id, orderEvents.actorId))
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt)),
    order.customerId
      ? db
          .select({ id: customers.id, name: customers.name, ordersCount: customers.ordersCount, totalSpentPaise: customers.totalSpentPaise, tags: customers.tags })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .then((r) => r[0] ?? null)
      : null,
  ]);
  const { accessToken, razorpaySignature, ...safe } = order;
  void razorpaySignature;
  return json({
    order: { ...safe, customerLink: `/order/${order.number}?t=${accessToken}` },
    items,
    events,
    customer,
    next: nextStatuses(order.status),
  });
});
