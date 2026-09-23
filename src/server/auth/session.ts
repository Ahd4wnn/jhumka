/**
 * Admin sessions: a random 256-bit token lives only in an httpOnly cookie; the database
 * stores its SHA-256. Sessions last 30 days and slide forward while in use.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { getDb } from '../db/client';
import { adminUsers, sessions } from '../db/schema';
import { isProd } from '../env';

export const SESSION_COOKIE = 'jh_admin';
const DAY = 24 * 60 * 60 * 1000;
const LIFETIME = 30 * DAY;
const RENEW_BELOW = 15 * DAY;

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string }) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LIFETIME);
  await getDb()
    .insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null, ip: meta.ip ?? null });
  return { token, expiresAt };
}

export async function validateSession(token: string | undefined): Promise<{ user: AdminSession; renewedUntil?: Date } | null> {
  if (!token || token.length > 100) return null;
  const db = getDb();
  const id = hashToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
    })
    .from(sessions)
    .innerJoin(adminUsers, eq(adminUsers.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || !row.isActive) return null;

  let renewedUntil: Date | undefined;
  if (row.expiresAt.getTime() - Date.now() < RENEW_BELOW) {
    renewedUntil = new Date(Date.now() + LIFETIME);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  }
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, renewedUntil };
}

export async function deleteSession(token: string | undefined) {
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions() {
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function setSessionCookie(cookies: AstroCookies, token: string, expires: Date) {
  cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', expires });
}

export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
