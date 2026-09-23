// SEO + safety smoke test against a running server (dev, `npm start`, or the live site):
//   npm run verify                      → http://localhost:4321
//   npm run verify -- https://jhumka.in
// Crawls the sitemap plus the fixed pages and checks every one has exactly one <h1>, a title,
// a meta description + canonical (when indexable), valid JSON-LD and alt text; then checks the
// private areas stay private.
const base = (process.argv[2] || process.env.VERIFY_URL || 'http://localhost:4321').replace(/\/$/, '');

const problems = [];
const fail = (msg) => problems.push(msg);

async function get(path, init) {
  try {
    return await fetch(base + path, { redirect: 'manual', ...init });
  } catch (e) {
    console.error(`Cannot reach ${base} (${e.cause?.code ?? e.message}). Start the server first: npm run dev`);
    process.exit(2);
  }
}

// ── Pages ─────────────────────────────────────────────────────────────────────
const sitemap = await get('/sitemap.xml');
if (sitemap.status !== 200) fail(`/sitemap.xml: HTTP ${sitemap.status}`);
const fromSitemap = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname);
const paths = [...new Set(['/', '/shop', '/checkout', '/track', ...fromSitemap])];

for (const path of paths) {
  const res = await get(path);
  if (res.status !== 200) {
    fail(`${path}: HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  const noindex = /<meta name="robots" content="noindex/.test(html);

  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail(`${path}: ${h1} <h1> elements`);
  if (!/<title>[^<]{10,}<\/title>/.test(html)) fail(`${path}: missing or short <title>`);
  if (!noindex) {
    if (!/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html)) fail(`${path}: missing canonical`);
    const desc = html.match(/<meta name="description" content="([^"]*)"/);
    if (!desc || desc[1].length < 50) fail(`${path}: missing or short meta description`);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(json);
      if (!data['@context'] || !data['@type']) fail(`${path}: JSON-LD without @context/@type`);
      if (data['@type'] === 'Product' && data.offers && !data.offers.price) fail(`${path}: Product offer without price`);
    } catch (e) {
      fail(`${path}: invalid JSON-LD (${e.message})`);
    }
  }
  for (const [, tag] of html.matchAll(/<img\b([^>]*)>/g)) {
    // A bare `alt` is how Astro serialises alt="" — valid, and right for decorative images.
    if (!/\balt(=|[\s/>]|$)/.test(tag)) fail(`${path}: <img> without alt`);
  }
  if (res.headers.get('x-content-type-options') !== 'nosniff') fail(`${path}: missing security headers`);
}

// ── Private areas ─────────────────────────────────────────────────────────────
const missing = await get('/products/this-piece-does-not-exist');
if (missing.status !== 404) fail(`unknown product: expected 404, got ${missing.status}`);

const robots = await (await get('/robots.txt')).text();
const blocksAll = /^Disallow: \/$/m.test(robots);
for (const rule of blocksAll ? [] : ['/admin', '/api/', '/checkout']) {
  if (!robots.includes(`Disallow: ${rule}`)) fail(`robots.txt: no "Disallow: ${rule}"`);
}

const admin = await get('/admin');
if (!/noindex/.test(admin.headers.get('x-robots-tag') ?? '')) fail('/admin: missing X-Robots-Tag noindex');

const me = await get('/api/admin/me');
if (me.status !== 401) fail(`/api/admin/me without login: expected 401, got ${me.status}`);

const forged = await get('/api/admin/products', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: '{}',
});
if (forged.status !== 403 && forged.status !== 401) fail(`cross-site admin POST: expected 403, got ${forged.status}`);

const hook = await get('/api/webhooks/razorpay', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'forged' },
  body: '{"event":"payment.captured"}',
});
if (hook.status < 400) fail(`webhook with a forged signature was accepted (HTTP ${hook.status})`);

const tracked = await get('/api/track', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ number: 'JH-1', phone: '9999999999' }),
});
if (tracked.status === 200) fail('/api/track returned an order for a made-up number');

console.log(`Checked ${paths.length} pages and the private areas on ${base}.`);
if (problems.length) {
  console.error(problems.map((p) => `  ✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('  ✓ Everything passes.');
