import type { APIRoute } from 'astro';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { adminUsers, customerNotes, customers, orders, tasks } from '@/server/db/schema';
import { requireAdmin, requireUuid } from '@/server/admin/guard';
import { handle, HttpError, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const db = getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) throw new HttpError(404, 'Customer not found.');
  const [orderRows, notes, taskRows] = await Promise.all([
    db
      .select({ id: orders.id, number: orders.number, status: orders.status, totalPaise: orders.totalPaise, createdAt: orders.createdAt, paidAt: orders.paidAt, shippingAddress: orders.shippingAddress })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.createdAt)),
    db
      .select({ id: customerNotes.id, body: customerNotes.body, createdAt: customerNotes.createdAt, author: adminUsers.name })
      .from(customerNotes)
      .leftJoin(adminUsers, eq(adminUsers.id, customerNotes.authorId))
      .where(eq(customerNotes.customerId, id))
      .orderBy(desc(customerNotes.createdAt)),
    db.select().from(tasks).where(eq(tasks.customerId, id)).orderBy(asc(tasks.doneAt), asc(tasks.dueAt)),
  ]);
  const addresses = [...new Map(orderRows.map((o) => [JSON.stringify(o.shippingAddress), o.shippingAddress])).values()];
  return json({
    customer,
    orders: orderRows.map(({ shippingAddress, ...o }) => {
      void shippingAddress;
      return o;
    }),
    addresses,
    notes,
    tasks: taskRows,
  });
});

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.email().trim().toLowerCase().max(160).nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).optional(),
});

export const PATCH: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const input = await readJson(request, patch);
  if (input.tags) input.tags = [...new Set(input.tags)];
  const [updated] = await getDb().update(customers).set(input).where(eq(customers.id, id)).returning();
  if (!updated) throw new HttpError(404, 'Customer not found.');
  return json({ customer: updated });
});

const note = z.object({ body: z.string().trim().min(1).max(4000) });

/** Adds a note to the customer's timeline. */
export const POST: APIRoute = handle(async ({ locals, request, params }) => {
  const admin = requireAdmin(locals);
  const id = requireUuid(params.id);
  const { body } = await readJson(request, note);
  const [created] = await getDb().insert(customerNotes).values({ customerId: id, body, authorId: admin.id }).returning();
  return json({ note: created }, { status: 201 });
});
