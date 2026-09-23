/** Admin team (owner only). The owner sets a first password for new staff, who can change it later. */
import type { APIRoute } from 'astro';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { adminUsers } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/password';
import { requireOwner, rethrowUnique } from '@/server/admin/guard';
import { handle, json, readJson } from '@/server/http';

const cols = { id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role, isActive: adminUsers.isActive, lastLoginAt: adminUsers.lastLoginAt, createdAt: adminUsers.createdAt };

export const GET: APIRoute = handle(async ({ locals }) => {
  requireOwner(locals);
  return json({ users: await getDb().select(cols).from(adminUsers).orderBy(asc(adminUsers.createdAt)) });
});

const body = z.object({
  email: z.email('Enter a valid email.').trim().toLowerCase().max(160),
  name: z.string().trim().min(1).max(80),
  role: z.enum(['owner', 'staff']),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
});

export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireOwner(locals);
  const { password, ...rest } = await readJson(request, body);
  const [created] = await getDb()
    .insert(adminUsers)
    .values({ ...rest, passwordHash: await hashPassword(password) })
    .returning(cols)
    .catch((e) => rethrowUnique(e, 'Someone with that email already has access.'));
  return json({ user: created }, { status: 201 });
});
