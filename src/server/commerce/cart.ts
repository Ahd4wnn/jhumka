/**
 * Prices a cart from the database. The browser only ever sends slugs and quantities — names,
 * prices and availability always come from here.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from '../db/client';
import { products } from '../db/schema';
import { MAX_QTY_PER_LINE } from './pricing';

export interface CartInput {
  slug: string;
  qty: number;
}

export interface PricedLine {
  productId: string;
  slug: string;
  name: string;
  imagePath: string | null;
  unitPricePaise: number;
  compareAtPaise: number | null;
  qty: number;
  lineTotalPaise: number;
  stockQty: number | null;
}

export interface CartIssue {
  slug: string;
  message: string;
}

export async function priceCart(db: DB, items: CartInput[]): Promise<{ lines: PricedLine[]; issues: CartIssue[] }> {
  // Merge duplicate slugs.
  const wanted = new Map<string, number>();
  for (const it of items) wanted.set(it.slug, (wanted.get(it.slug) ?? 0) + Math.max(0, Math.floor(it.qty)));

  const slugs = [...wanted.keys()];
  const rows = slugs.length
    ? await db
        .select()
        .from(products)
        .where(and(inArray(products.slug, slugs), eq(products.isPublished, true)))
    : [];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const lines: PricedLine[] = [];
  const issues: CartIssue[] = [];
  for (const [slug, requested] of wanted) {
    const p = bySlug.get(slug);
    if (!p || p.pricePaise == null) {
      issues.push({ slug, message: 'This piece is no longer available and was removed from your bag.' });
      continue;
    }
    let qty = Math.min(requested, MAX_QTY_PER_LINE);
    if (p.stockQty != null && qty > p.stockQty) {
      if (p.stockQty <= 0) {
        issues.push({ slug, message: `${p.name} just sold out and was removed from your bag.` });
        continue;
      }
      qty = p.stockQty;
      issues.push({ slug, message: `Only ${p.stockQty} left of ${p.name} — we updated the quantity.` });
    }
    if (qty <= 0) continue;
    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      imagePath: p.images?.[0]?.path ?? null,
      unitPricePaise: p.pricePaise,
      compareAtPaise: p.compareAtPaise,
      qty,
      lineTotalPaise: p.pricePaise * qty,
      stockQty: p.stockQty,
    });
  }
  return { lines, issues };
}
