/** Sitemap built from the live catalogue (replaces @astrojs/sitemap, which only sees static routes). */
import type { APIRoute } from 'astro';
import { getCollections, getProducts } from '@/lib/catalog';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site }) => {
  const [collections, products] = await Promise.all([getCollections(), getProducts()]);
  const withProducts = collections.filter((c) => products.some((p) => p.collection_id === c.id));
  const newest = products.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), '1970-01-01');

  const urls = [
    { loc: '/', lastmod: newest, priority: '1.0' },
    { loc: '/shop/', lastmod: newest, priority: '0.9' },
    ...withProducts.map((c) => ({ loc: `/collections/${c.slug}/`, lastmod: newest, priority: '0.8' })),
    ...products.map((p) => ({ loc: `/products/${p.slug}/`, lastmod: p.updated_at, priority: '0.7' })),
    // Policy pages: customers and payment providers both expect to find these.
    ...['/contact/', '/policies/terms/', '/policies/privacy/', '/policies/refunds/', '/policies/shipping/'].map((loc) => ({ loc, lastmod: newest, priority: '0.3' })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${esc(new URL(u.loc, site).toString())}</loc><lastmod>${u.lastmod.slice(0, 10)}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
};
