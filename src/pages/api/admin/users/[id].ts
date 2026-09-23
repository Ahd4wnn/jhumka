import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { adminUsers } from '@/server/db/schema';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { deleteUserSessions } from '@/server/auth/session';
import { requireAdmin, requireOwner, requireUuid } from '@/server/admin/guard';
import { handle, HttpError, json, readJson } from '@/server/http';

const ownerPatch = z.object({ role: z.enum(['owner', 'staff']).optional(), isActive: z.boolean().optional(), password: z.string().min(10).max(200).optional() });
const selfPatch = z.object({ currentPassword: z.string().min(1), password: z.string().min(10, 'Use at least 10 characters.').max(200) });

/** Owners manage anyone; everyone can change their own password (with their current one). */
export const PATCH: APIRoute = handle(async ({ locals, request, params }) => {
  const me = requireAdmin(locals);
  const id = requireUuid(params.id);
  const db = getDb();

  if (id === me.id && me.role !== 'owner') {
    const { currentPassword, password } = await readJson(request, selfPatch);
    const [u] = await db.select({ hash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, id));
    if (!u || !(await verifyPassword(u.hash, currentPassword))) throw new HttpError(400, 'Your current password is not correct.');
    await db.update(adminUsers).set({ passwordHash: await hashPassword(password) }).where(eq(adminUsers.id, id));
    return json({ ok: true });
  }

  requireOwner(locals);
  const { password, ...rest } = await readJson(request, ownerPatch);
  if (id === me.id && (rest.role === 'staff' || rest.isActive === false)) throw new HttpError(400, 'You cannot remove your own owner access.');
  const [updated] = await db
    .update(adminUsers)
    .set({ ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
    .where(eq(adminUsers.id, id))
    .returning({ id: adminUsers.id });
  if (!updated) throw new HttpError(404, 'User not found.');
  if (rest.isActive === false || password) await deleteUserSessions(id);
  return json({ ok: true });
});

export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  const me = requireOwner(locals);
  const id = requireUuid(params.id);
  if (id === me.id) throw new HttpError(400, 'You cannot delete your own account.');
  await getDb().delete(adminUsers).where(eq(adminUsers.id, id));
  return json({ ok: true });
});
