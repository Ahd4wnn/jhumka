/**
 * Runs for every request:
 * - security headers everywhere
 * - admin session for /admin and /api/admin (JSON 401 for the API when signed out)
 * - same-origin check for state-changing admin API calls (CSRF defence for JSON requests)
 */
import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, setSessionCookie, validateSession } from '@/server/auth/session';
import { startBackgroundJobs } from '@/server/jobs';

const PUBLIC_ADMIN_API = new Set(['/api/admin/auth/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  startBackgroundJobs();
  const { pathname } = context.url;
  const isAdminApi = pathname.startsWith('/api/admin');
  const isAdmin = isAdminApi || pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin) {
    if (isAdminApi && context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      const origin = context.request.headers.get('origin');
      if (origin && origin !== context.url.origin) {
        return new Response(JSON.stringify({ error: 'Cross-site request blocked.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    }
    const token = context.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await validateSession(token).catch(() => null) : null;
    if (session) {
      context.locals.admin = session.user;
      if (session.renewedUntil && token) setSessionCookie(context.cookies, token, session.renewedUntil);
    }
    if (isAdminApi && !session && !PUBLIC_ADMIN_API.has(pathname)) {
      return new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
  }

  const response = await next();
  const h = response.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")');
  if (!h.has('X-Frame-Options')) h.set('X-Frame-Options', isAdmin ? 'DENY' : 'SAMEORIGIN');
  if (isAdmin) {
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});
