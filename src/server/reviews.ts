/**
 * Customer reviews. Only buyers can write one — from their private order page, once the order
 * has shipped — so every review is a verified purchase. New reviews wait for approval in the
 * admin unless Settings → Reviews → "Publish straight away" is on.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { invalidateCatalog } from '@/lib/catalog';
import { getDb, hasDatabase } from './db/client';
import { orderItems, orders, products, reviews, type MediaRef } from './db/schema';
import { addEvent } from './commerce/orders';
import { pgCode } from './admin/guard';
import { HttpError } from './http';
import { deleteMedia, processImage } from './media';
import { publish } from './notify/live';
import { getSettings } from './settings';

export type Review = typeof reviews.$inferSelect;

/** Orders whose pieces can be reviewed (the customer has them, or they are on the way). */
export const REVIEWABLE_STATUSES = ['shipped', 'delivered'] as const;
export const MAX_REVIEW_PHOTOS = 4;
export const canReview = (status: string) => (REVIEWABLE_STATUSES as readonly string[]).includes(status);

/** "Priya Sharma" → "Priya S." — the default public name, which the customer can change. */
export function displayName(full: string): string {
  const [first = '', ...rest] = full.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

export interface ReviewInput {
  number: string;
  token: string;
  productId: string;
  rating: number;
  title?: string;
  body: string;
  authorName: string;
  photos: Buffer[];
}

const ALREADY = 'You have already reviewed this piece. Thank you!';

export async function submitReview(input: ReviewInput): Promise<Review> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.number, input.number), eq(orders.accessToken, input.token)));
  if (!order) throw new HttpError(404, 'We could not find that order.');
  if (!canReview(order.status)) throw new HttpError(409, 'You can review your pieces once your order has shipped.');

  const [item] = await db
    .select({ name: orderItems.name })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, input.productId)));
  if (!item) throw new HttpError(404, 'That piece is not part of this order.');

  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.orderId, order.id), eq(reviews.productId, input.productId)));
  if (existing) throw new HttpError(409, ALREADY);
  if (input.photos.length > MAX_REVIEW_PHOTOS) throw new HttpError(400, `Add up to ${MAX_REVIEW_PHOTOS} photos.`);

  // Photos are re-encoded by sharp, which also drops EXIF data such as the phone's GPS location.
  const images: MediaRef[] = [];
  const discard = () => Promise.all(images.map((i) => deleteMedia(i.path)));
  try {
    for (const photo of input.photos) images.push(await processImage(photo, 'reviews'));
  } catch (err) {
    await discard();
    throw new HttpError(400, err instanceof Error && /too large/i.test(err.message) ? err.message : 'One of the photos could not be read. Please use JPG, PNG or WebP.');
  }

  const { reviews: rules } = await getSettings();
  const status = rules.autoPublish ? 'published' : 'pending';
  let review: Review;
  try {
    [review] = await db
      .insert(reviews)
      .values({
        productId: input.productId,
        orderId: order.id,
        customerId: order.customerId,
        rating: input.rating,
        title: input.title || null,
        body: input.body,
        authorName: input.authorName,
        images,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      })
      .returning();
  } catch (err) {
    await discard();
    if (pgCode(err) === '23505') throw new HttpError(409, ALREADY);
    throw err;
  }

  await addEvent(db, order.id, 'review', `${input.rating}★ review of ${item.name}${status === 'published' ? ' (published)' : ' · waiting for approval'}`);
  if (status === 'published') invalidateCatalog();
  publish({ type: 'review.new', orderNumber: order.number, customerName: order.name, message: `New ${input.rating}★ review of ${item.name} from ${input.authorName}` });
  return review;
}

/** Which pieces of an order are already reviewed (productId → status and rating). */
export async function reviewsForOrder(orderId: string): Promise<Map<string, Pick<Review, 'status' | 'rating'>>> {
  const rows = await getDb()
    .select({ productId: reviews.productId, status: reviews.status, rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.orderId, orderId));
  return new Map(rows.map((r) => [r.productId, { status: r.status, rating: r.rating }]));
}

/* ───────── Storefront ───────── */
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  images: MediaRef[];
  reply: string | null;
  createdAt: Date;
}

export interface ReviewSummary {
  count: number;
  average: number;
  /** Number of reviews per star, index 0 = 1★ … index 4 = 5★. */
  distribution: [number, number, number, number, number];
}

export async function productReviews(productId: string, limit = 100): Promise<{ summary: ReviewSummary; reviews: PublicReview[] }> {
  const summary: ReviewSummary = { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] };
  if (!hasDatabase()) return { summary, reviews: [] };
  const db = getDb();
  const published = and(eq(reviews.productId, productId), eq(reviews.status, 'published'));
  const [list, counts] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        authorName: reviews.authorName,
        images: reviews.images,
        reply: reviews.reply,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(published)
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
    db
      .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(published)
      .groupBy(reviews.rating),
  ]);
  let total = 0;
  for (const { rating, n } of counts) {
    summary.distribution[rating - 1] = n;
    summary.count += n;
    total += rating * n;
  }
  summary.average = summary.count ? total / summary.count : 0;
  return { summary, reviews: list };
}

export interface RecentReview extends PublicReview {
  product: { name: string; slug: string };
}

/** Newest published reviews across the shop, for the home page. */
export async function recentReviews(limit = 3): Promise<RecentReview[]> {
  if (!hasDatabase()) return [];
  try {
    const rows = await getDb()
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        authorName: reviews.authorName,
        images: reviews.images,
        reply: reviews.reply,
        createdAt: reviews.createdAt,
        name: products.name,
        slug: products.slug,
      })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(and(eq(reviews.status, 'published'), eq(products.isPublished, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);
    return rows.map(({ name, slug, ...r }) => ({ ...r, product: { name, slug } }));
  } catch (err) {
    console.error('[reviews] recent', err);
    return [];
  }
}
