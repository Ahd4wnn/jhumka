import type { APIRoute } from 'astro';
import { isDemoCatalog } from '@/lib/catalog';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap.xml', site).toString();
  // Demo builds (no database) must never be crawled.
  const body =
    isDemoCatalog && import.meta.env.PROD
      ? 'User-agent: *\nDisallow: /\n'
      : ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /order/', 'Disallow: /track', '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
