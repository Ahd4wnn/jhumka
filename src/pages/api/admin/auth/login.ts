import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { adminUsers } from '@/server/db/schema';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { clientIp, handle, HttpError, json, rateLimit, readJson } from '@/server/http';

const body = z.object({ email: z.string().trim().toLowerCase().max(160), password: z.string().min(1).max(200) });

// Checked when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;

export const POST: APIRoute = handle(async ({ request, cookies, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  rateLimit(`login-ip:${ip}`, 20, 15 * 60_000);
  const { email, password } = await readJson(request, body);
  rateLimit(`login-email:${email}`, 8, 15 * 60_000);

  const db = getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  dummyHash ??= hashPassword('jhumka-timing-equaliser');
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !ok || !user.isActive) throw new HttpError(401, 'That email and password don’t match.');

  const { token, expiresAt } = await createSession(user.id, { userAgent: request.headers.get('user-agent'), ip });
  setSessionCookie(cookies, token, expiresAt);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});
