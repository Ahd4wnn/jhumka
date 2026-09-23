import type { APIRoute } from 'astro';
import { clearSessionCookie, deleteSession, SESSION_COOKIE } from '@/server/auth/session';
import { handle, json } from '@/server/http';

export const POST: APIRoute = handle(async ({ cookies }) => {
  await deleteSession(cookies.get(SESSION_COOKIE)?.value);
  clearSessionCookie(cookies);
  return json({ ok: true });
});
