/**
 * Runs for every request:
 * - security headers everywhere
 * - admin session for /admin and /api/admin (JSON 401 for the API when signed out)
 * - same-origin check for every state-changing request (CSRF defence)
 *
 * The origin check lives here rather than in Astro's `security.checkOrigin`, because behind a
 * reverse proxy the app speaks plain HTTP: Astro would compare the browser's `https://…` Origin
 * against its own `http://…` URL and reject every form post. Comparing the Origin's host with the
 * forwarded Host header is proxy-safe and just as strict.
 */
import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, setSessionCookie, validateSession } from '@/server/auth/session';
import { startBackgroundJobs } from '@/server/jobs';

const PUBLIC_ADMIN_API = new Set(['/api/admin/auth/login']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** false when the request carries an Origin from a different site. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // No Origin: server-to-server (e.g. the Razorpay webhook, which verifies its own signature).
  try {
    return new URL(origin).host === (request.headers.get('host') ?? '');
  } catch {
    return false;
  }
}

const blocked = () =>
  new Response(JSON.stringify({ error: 'Cross-site request blocked.' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const onRequest = defineMiddleware(async (context, next) => {
  startBackgroundJobs();
  const { pathname } = context.url;
  const isAdminApi = pathname.startsWith('/api/admin');
  const isAdmin = isAdminApi || pathname === '/admin' || pathname.startsWith('/admin/');

  // Anything that changes state must come from this site.
  if (WRITE_METHODS.has(context.request.method)) {
    if (!sameOrigin(context.request)) return blocked();
    // Admin writes must prove where they came from; browsers always send Origin on these.
    if (isAdminApi && !context.request.headers.get('origin')) return blocked();
  }

  if (isAdmin) {
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
