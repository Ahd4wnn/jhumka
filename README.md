# Jhumka

Jewellery shop for [@jhumka.in_](https://www.instagram.com/jhumka.in_/): storefront, Razorpay
checkout, and an admin with a CRM — one Node server on your own PostgreSQL.

- **Storefront** — Astro (server-rendered), Tailwind v4, GSAP + Lenis motion. Colours #7D46AB / #FFFFFF, Instrument Serif + Sans.
- **Reviews** — verified buyers review pieces (stars, text, up to 4 photos) from their order page once it ships; star ratings on product pages, cards and in Google results. New reviews wait for approval in Admin → Reviews (switchable in Settings).
- **Checkout** — guest checkout, prices always recalculated on the server, Razorpay (UPI, cards, net banking, wallets), webhook backup, order tracking.
- **Admin + CRM** (`/admin`) — dashboard, orders pipeline (packed → shipped → delivered), refunds, invoice PDFs, customers with notes/tags/follow-ups, abandoned checkouts, review moderation with public replies, coupons, reports + CSV, settings, team.
- **Instagram feed** — the home page shows the latest posts from @jhumka.in_ via the official Instagram API (no scraping). Images are copied to /media every 30 min; the token renews itself weekly. Connect in Admin → Settings → Instagram feed.
- **Owner alerts** — a Telegram message per paid order to the founders' group + live pop-up and chime in the admin.
- **Data** — PostgreSQL 18 via Drizzle ORM (`src/server/db/schema.ts`, migrations in `drizzle/`). Money is stored in paise.

## Run it on this PC (Windows)

Prerequisites: Node 22+, PostgreSQL 18 (already installed at `D:\PostgreSQL`).

1. **Create the database** (asks for your postgres password, then a new one for the `jhumka` user):
   ```powershell
   D:\PostgreSQL\bin\psql -U postgres -f D:\f13s\jhumka\scripts\db\create.sql
   ```
2. **Configure**: copy `.env.example` to `.env` and fill in `DATABASE_URL` / `TEST_DATABASE_URL`
   with the password you just chose, plus your Razorpay **test** keys.
3. **Install, create tables, add starter data, create your login**:
   ```powershell
   npm install
   npm run db:migrate
   npm run db:seed
   npm run admin:create
   ```
4. **Start**: `npm run dev` → shop at http://localhost:4321, admin at http://localhost:4321/admin.

Test payments: in Razorpay test mode use UPI `success@razorpay` or test cards
(e.g. `4111 1111 1111 1111`, any future expiry, any CVV). To receive webhooks locally, run
`npx cloudflared tunnel --url http://localhost:4321` and add `<tunnel-url>/api/webhooks/razorpay`
as a webhook in the Razorpay **test** dashboard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / run it (`dist/server/entry.mjs`) |
| `npm run check` | Type-check everything |
| `npm run verify` | SEO + privacy smoke test against a running server (`-- <url>` for another one) |
| `npm test` | Unit tests + integration tests (integration needs `TEST_DATABASE_URL`) |
| `npm run db:generate` | Create a migration after changing `schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Starter collections + draft products (safe to re-run) |
| `npm run db:studio` | Browse the database in the browser |
| `npm run admin:create` | Create an admin, or reset a password |

## Where things live

```
src/pages/            storefront pages, /checkout, /order/[number], /track, /admin, API routes (api/*)
src/components/       storefront components (sections/, Photo, ProductCard, CartDrawer…)
src/admin/            admin + CRM React app (pages/, ui.tsx, api.ts)
src/server/           server-only code
  db/                 schema + connection
  commerce/           pricing, cart, orders (markOrderPaid), Razorpay, status rules
  notify/             owner alerts: outbox + Telegram + live events
  admin/              admin guards, validation, reports
  media.ts            photo processing (AVIF/WebP, 480/960/1600 px)
  invoice.ts          invoice PDFs (GST-ready)
drizzle/              SQL migrations
deploy/, docs/DEPLOY.md   production setup on an Ubuntu VPS
tests/                vitest unit + integration tests
```

## Going live

Follow [docs/DEPLOY.md](docs/DEPLOY.md) — Ubuntu VPS, PostgreSQL, Caddy HTTPS, systemd, nightly
backups, Razorpay live keys + webhook, Telegram alerts.

## Before launch checklist

- [ ] Real product photos + prices added in Admin → Products, and pieces set **Live**
- [ ] Logo in `public/brand/logo.svg` (+ `logo-512.png` for Google), lifestyle photos in `src/assets/lifestyle/`
- [ ] `npm run verify -- https://your-domain` passes against the live site
- [ ] Shipping fee / free-shipping threshold in Admin → Settings
- [ ] Business address in Admin → Settings (appears on invoices)
- [ ] Telegram bot connected and **Send test alert** received in the founders' group
- [ ] Instagram connected in Admin → Settings → Instagram feed (hero image: replace the file in `src/assets/hero/` to change it)
- [ ] Razorpay live keys + webhook, one real payment tested and refunded
- [ ] `PUBLIC_SITE_URL` set to the final domain
