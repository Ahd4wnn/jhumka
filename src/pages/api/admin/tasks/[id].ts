import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { tasks } from '@/server/db/schema';
import { requireAdmin, requireUuid } from '@/server/admin/guard';
import { handle, HttpError, json, readJson } from '@/server/http';

const patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  done: z.boolean().optional(),
});

export const PATCH: APIRoute = handle(async ({ locals, request, params }) => {
  requireAdmin(locals);
  const id = requireUuid(params.id);
  const { done, ...rest } = await readJson(request, patch);
  const [updated] = await getDb()
    .update(tasks)
    .set({ ...rest, ...(done === undefined ? {} : { doneAt: done ? new Date() : null }) })
    .where(eq(tasks.id, id))
    .returning();
  if (!updated) throw new HttpError(404, 'Task not found.');
  return json({ task: updated });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  await getDb().delete(tasks).where(eq(tasks.id, requireUuid(params.id)));
  return json({ ok: true });
});
