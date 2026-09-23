/**
 * Demo catalogue used ONLY in `astro dev` when Supabase isn't configured yet.
 * Names mirror pieces seen on @jhumka.in_; prices here are placeholders for testing the bag.
 * Production builds never use this file (see src/lib/catalog.ts).
 */
import type { Collection, Product } from '@/lib/types';

const now = '2026-09-01T00:00:00.000Z';

const c = (slug: string, name: string, tagline: string, description: string, sort: number): Collection => ({
  id: `c-${slug}`,
  slug,
  name,
  tagline,
  description,
  cover_path: null,
  sort_order: sort,
  is_published: true,
});

export const fallbackCollections: Collection[] = [
  c('infinity', 'Infinity', 'Pure beauty, softly shining.', 'Endless loops in warm gold — the forever piece you never take off.', 1),
  c('hearts', 'Hearts', 'Forever loved beauty.', 'Open hearts, puffed hearts and petite hearts for every kind of love story.', 2),
  c('tulip', 'Tulip', 'Grace in every bloom.', 'Tiny enamelled tulips on fine gold chains — spring, all year round.', 3),
  c('moon-and-venus', 'Moon & Venus', 'For the ones who shine after dark.', 'Crescent moons and evening stars, made for night-time magic.', 4),
  c('antique', 'Antique', 'Old-world charm, made new.', 'Butterflies and filigree with an heirloom soul.', 5),
  c('sparkle', 'Sparkle', 'Sparkle every moment.', 'Stone-set blossoms and rings that catch every light.', 6),
  c('forever-simple', 'Forever Simple', 'Forever simple.', 'Dainty drops and roses for effortless, everyday elegance.', 7),
  c('onam', 'Onam', 'Festive gold for the season.', 'Coin fringes and temple-inspired gold for festive days.', 8),
];

let n = 0;
const p = (
  slug: string,
  name: string,
  collection: string,
  type: Product['product_type'],
  price: number,
  short: string,
  extra: Partial<Product> = {},
): Product => ({
  id: `p-${slug}`,
  slug,
  name,
  short_description: short,
  description: `${short} Finished in a warm gold tone on a fine, lightweight chain — easy to layer, easy to love.`,
  price_inr: price,
  compare_at_price_inr: null,
  collection_id: `c-${collection}`,
  product_type: type,
  material: 'Gold-plated',
  images: [],
  sku: null,
  stock_qty: null,
  stock_status: 'in_stock',
  is_featured: false,
  is_published: true,
  sort_order: ++n,
  created_at: now,
  updated_at: now,
  ...extra,
});

export const fallbackProducts: Product[] = [
  p('infinity-necklace', 'Infinity Necklace', 'infinity', 'necklace', 349, 'A delicate infinity loop that rests right at the collarbone.', { is_featured: true }),
  p('heart-shape-pendant-necklace', 'Heart Shape Pendant Necklace', 'hearts', 'necklace', 329, 'A softly puffed gold heart on a whisper-fine chain.', { is_featured: true }),
  p('heart-pendant-necklace', 'Heart Pendant Necklace', 'hearts', 'necklace', 299, 'An open-heart outline — light, airy and endlessly wearable.'),
  p('petite-open-heart-necklace', 'Petite Open Heart Necklace', 'hearts', 'necklace', 99, 'Our littlest open heart, made for gifting.', { compare_at_price_inr: 199 }),
  p('tulip-necklace', 'Tulip Necklace', 'tulip', 'necklace', 379, 'A single enamelled tulip bud swaying on a gold chain.', { is_featured: true }),
  p('crescent-moon-pendant-necklace', 'Crescent Moon Pendant Necklace', 'moon-and-venus', 'necklace', 349, 'A glowing crescent for the night-sky dreamer.', { is_featured: true }),
  p('moon-and-venus-bracelet', 'Moon & Venus Bracelet', 'moon-and-venus', 'bracelet', 299, 'A crescent moon and evening star on a fine gold bracelet.', { stock_status: 'low_stock' }),
  p('antique-butterfly-necklace', 'Antique Butterfly Necklace', 'antique', 'necklace', 399, 'A filigree butterfly with an heirloom finish.', { is_featured: true }),
  p('sparkle-blossom-necklace', 'Sparkle Blossom Necklace', 'sparkle', 'necklace', 369, 'A stone-set blossom that sparkles with every move.'),
  p('crafted-clover-necklace', 'Crafted Clover Necklace', 'sparkle', 'necklace', 359, 'A four-petal clover, crafted for every story.'),
  p('golden-wave-ring', 'Golden Wave Ring', 'sparkle', 'ring', 249, 'An adjustable sculpted ring with a soft wave.'),
  p('gemstone-charm-bracelet', 'Gemstone Charm Bracelet', 'sparkle', 'bracelet', 329, 'Colour-pop stones strung between gold beads.'),
  p('teardrop-pendant-necklace', 'Teardrop Pendant Necklace', 'forever-simple', 'necklace', 319, 'A single teardrop that catches the light.'),
  p('rose-pendant-necklace', 'Rose Pendant Necklace', 'forever-simple', 'necklace', 339, 'A tiny red rose on a gold stem — forever simple.', { is_featured: true }),
  p('onam-coin-necklace', 'Onam Coin Necklace', 'onam', 'necklace', 549, 'A fringe of gold coins inspired by festive temple jewellery.', { stock_status: 'sold_out' }),
];
