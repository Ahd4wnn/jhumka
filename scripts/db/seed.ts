/**
 * Starter catalogue from @jhumka.in_: collections are live, every product starts as an
 * unpublished draft with no price, so nothing sells until photos + price are added in /admin.
 * Safe to run more than once. `npm run db:seed`
 */
import { getDb, getSql } from '../../src/server/db/client';
import { collections, products } from '../../src/server/db/schema';

const db = getDb();

const cols = [
  ['infinity', 'Infinity', 'Pure beauty, softly shining.', 'Endless loops in warm gold — the forever piece you never take off.'],
  ['hearts', 'Hearts', 'Forever loved beauty.', 'Open hearts and puffed hearts for every kind of love story.'],
  ['tulip', 'Tulip', 'Grace in every bloom.', 'Tiny tulips on fine gold chains.'],
  ['moon-and-venus', 'Moon & Venus', 'For the ones who shine after dark.', 'Crescent moons and evening stars.'],
  ['antique', 'Antique', 'Old-world charm, made new.', 'Pieces with an heirloom soul.'],
  ['sparkle', 'Sparkle', 'Sparkle every moment.', 'Stone-set pieces and rings that catch every light.'],
  ['forever-simple', 'Forever Simple', 'Forever simple.', 'Dainty drops and roses for effortless, everyday elegance.'],
  ['onam', 'Onam', 'Festive gold for the season.', 'Festive pieces for the season.'],
] as const;

await db
  .insert(collections)
  .values(cols.map(([slug, name, tagline, description], i) => ({ slug, name, tagline, description, sortOrder: i + 1 })))
  .onConflictDoNothing({ target: collections.slug });

const bySlug = new Map((await db.select({ id: collections.id, slug: collections.slug }).from(collections)).map((c) => [c.slug, c.id]));

const drafts = [
  ['infinity-necklace', 'Infinity Necklace', 'infinity', 'necklace'],
  ['heart-shape-pendant-necklace', 'Heart Shape Pendant Necklace', 'hearts', 'necklace'],
  ['heart-pendant-necklace', 'Heart Pendant Necklace', 'hearts', 'necklace'],
  ['tulip-necklace', 'Tulip Necklace', 'tulip', 'necklace'],
  ['moon-and-venus-bracelet', 'Moon & Venus Bracelet', 'moon-and-venus', 'bracelet'],
  ['crescent-moon-pendant-necklace', 'Crescent Moon Pendant Necklace', 'moon-and-venus', 'necklace'],
  ['antique-butterfly-necklace', 'Antique Butterfly Necklace', 'antique', 'necklace'],
  ['sparkle-necklace', 'Sparkle Necklace', 'sparkle', 'necklace'],
  ['crafted-flower-necklace', 'Crafted Flower Necklace', 'sparkle', 'necklace'],
  ['teardrop-pendant-necklace', 'Teardrop Pendant Necklace', 'forever-simple', 'necklace'],
  ['rose-pendant-necklace', 'Rose Pendant Necklace', 'forever-simple', 'necklace'],
  ['onam-collection-necklace', 'Onam Collection Necklace', 'onam', 'necklace'],
] as const;

await db
  .insert(products)
  .values(drafts.map(([slug, name, col, type], i) => ({ slug, name, collectionId: bySlug.get(col), productType: type, sortOrder: i + 1 })))
  .onConflictDoNothing({ target: products.slug });

console.log(`✓ Seeded ${cols.length} collections and ${drafts.length} draft products.`);
await getSql().end();
