/** Follow-up tasks. ?view=open|today|overdue|done */
import type { APIRoute } from 'astro';
import { and, asc, desc, eq, isNotNull, isNull, lt, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { adminUsers, customers, orders, tasks } from '@/server/db/schema';
import { requireAdmin } from '@/server/admin/guard';
import { handle, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const view = url.searchParams.get('view') ?? 'open';
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const where: SQL[] = [];
  if (view === 'done') where.push(isNotNull(tasks.doneAt));
  else {
    where.push(isNull(tasks.doneAt));
    if (view === 'today') where.push(lte(tasks.dueAt, endOfToday));
    if (view === 'overdue') where.push(lt(tasks.dueAt, new Date()));
  }
  const rows = await getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      doneAt: tasks.doneAt,
      createdAt: tasks.createdAt,
      customerId: tasks.customerId,
      customerName: customers.name,
      orderNumber: orders.number,
      assignee: adminUsers.name,
    })
    .from(tasks)
    .leftJoin(customers, eq(customers.id, tasks.customerId))
    .leftJoin(orders, eq(orders.id, tasks.orderId))
    .leftJoin(adminUsers, eq(adminUsers.id, tasks.assigneeId))
    .where(and(...where))
    .orderBy(view === 'done' ? desc(tasks.doneAt) : asc(tasks.dueAt))
    .limit(300);
  return json({ tasks: rows });
});

const input = z.object({
  title: z.string().trim().min(1, 'What needs doing?').max(200),
  dueAt: z.coerce.date().nullable(),
  customerId: z.uuid().nullable().optional(),
  orderNumber: z.string().max(20).nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
});

export const POST: APIRoute = handle(async ({ locals, request }) => {
  const admin = requireAdmin(locals);
  const t = await readJson(request, input);
  const db = getDb();
  let orderId: string | null = null;
  let customerId = t.customerId ?? null;
  if (t.orderNumber) {
    const [o] = await db.select({ id: orders.id, customerId: orders.customerId }).from(orders).where(eq(orders.number, t.orderNumber.toUpperCase()));
    orderId = o?.id ?? null;
    customerId ??= o?.customerId ?? null;
  }
  const [created] = await db
    .insert(tasks)
    .values({ title: t.title, dueAt: t.dueAt, customerId, orderId, assigneeId: t.assigneeId ?? admin.id, createdById: admin.id })
    .returning();
  return json({ task: created }, { status: 201 });
});
