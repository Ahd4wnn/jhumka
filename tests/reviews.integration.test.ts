/**
 * Review rules against the real `jhumka_test` database: only buyers of shipped orders can review,
 * once per piece, photos are processed, and only published reviews reach the shop.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import sharp from 'sharp';
import { getDb, getSql, hasDatabase } from '@/server/db/client';
import { products, reviews } from '@/server/db/schema';
import { changeStatus, createCheckout, markOrderPaid, type Order } from '@/server/commerce/orders';
import { setRazorpayGateway } from '@/server/commerce/razorpay';
import { deleteMedia, mediaFilePath } from '@/server/media';
import { displayName, productReviews, submitReview, type ReviewInput } from '@/server/reviews';
import { saveSetting } from '@/server/settings';
import { invalidateCatalog, getProduct } from '@/lib/catalog';
import { existsSync } from 'node:fs';

describe('displayName', () => {
  it('shows first name and last initial', () => {
    expect(displayName('Priya Sharma')).toBe('Priya S.');
    expect(displayName('  anu  maria  joseph ')).toBe('anu J.');
    expect(displayName('Meera')).toBe('Meera');
  });
});

describe.skipIf(!hasDatabase())('customer reviews', () => {
  let order: Order;
  let necklace: string;
  let bracelet: string;
  let notBought: string;
  const photos: string[] = [];
  let n = 0;

  const review = (over: Partial<ReviewInput> = {}) =>
    submitReview({ number: order.number, token: order.accessToken, productId: necklace, rating: 5, body: 'Lovely finish, wear it every day.', authorName: 'Priya S.', photos: [], ...over });

  beforeAll(async () => {
    const db = getDb();
    await migrate(db, { migrationsFolder: 'drizzle' });
    await db.execute(sql`truncate reviews, notifications, order_events, order_items, orders, customers, coupons, products, collections, settings restart identity cascade`);
    const rows = await db
      .insert(products)
      .values([
        { slug: 'infinity-necklace', name: 'Infinity Necklace', pricePaise: 34_900, isPublished: true },
        { slug: 'moon-bracelet', name: 'Moon Bracelet', pricePaise: 29_900, isPublished: true },
        { slug: 'tulip-necklace', name: 'Tulip Necklace', pricePaise: 37_900, isPublished: true },
      ])
      .returning({ id: products.id, slug: products.slug });
    [necklace, bracelet, notBought] = rows.map((r) => r.id);
    await saveSetting('alerts', { whatsappEnabled: false, callmebotPhone: '+916238193133', callmebotApiKey: '' });
    setRazorpayGateway({
      createOrder: async ({ amount }) => ({ id: `order_R${++n}`, amount, currency: 'INR' }),
      fetchPayment: async (id) => ({ id, method: 'upi' }),
      refund: async (_, { amount }) => ({ id: 'rfnd', amount }),
    });
    ({ order } = await createCheckout({
      items: [{ slug: 'infinity-necklace', qty: 1 }, { slug: 'moon-bracelet', qty: 1 }],
      name: 'Priya Sharma',
      phone: '+919876543210',
      email: null,
      address: { name: 'Priya Sharma', phone: '+919876543210', line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' },
    }));
    ({ order } = await markOrderPaid({ razorpayOrderId: order.razorpayOrderId!, paymentId: 'pay_R1', source: 'webhook' }));
  });

  afterAll(async () => {
    setRazorpayGateway(null);
    await Promise.all(photos.map((p) => deleteMedia(p)));
    await getSql().end();
  });

  it('waits until the order has shipped', async () => {
    await expect(review()).rejects.toMatchObject({ status: 409 });
    order = await changeStatus(order.id, 'shipped', undefined as unknown as string);
  });

  it('needs the order’s secret link, and a piece from that order', async () => {
    await expect(review({ token: 'x'.repeat(32) })).rejects.toMatchObject({ status: 404 });
    await expect(review({ productId: notBought })).rejects.toMatchObject({ status: 404 });
  });

  it('saves a review with photos, waiting for approval', async () => {
    const jpg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#7d46ab' } }).jpeg().toBuffer();
    const saved = await review({ photos: [jpg], title: 'Everyday favourite' });
    photos.push(...saved.images.map((i) => i.path));
    expect(saved.status).toBe('pending');
    expect(saved.images).toHaveLength(1);
    expect(saved.images[0].path.startsWith('reviews/')).toBe(true);
    expect(existsSync(mediaFilePath(`${saved.images[0].path}-480.webp`)!)).toBe(true);
    // Waiting reviews are not public yet.
    expect((await productReviews(necklace)).summary.count).toBe(0);
  });

  it('allows one review per piece per order', async () => {
    await expect(review({ rating: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects files that are not photos', async () => {
    await expect(review({ productId: bracelet, photos: [Buffer.from('not an image')] })).rejects.toMatchObject({ status: 400 });
  });

  it('shows published reviews and ratings in the shop', async () => {
    const db = getDb();
    await db.update(reviews).set({ status: 'published' }).where(eq(reviews.productId, necklace));
    const { summary, reviews: list } = await productReviews(necklace);
    expect(summary).toMatchObject({ count: 1, average: 5, distribution: [0, 0, 0, 0, 1] });
    expect(list[0]).toMatchObject({ title: 'Everyday favourite', authorName: 'Priya S.' });
    invalidateCatalog();
    expect((await getProduct('infinity-necklace'))?.rating).toEqual({ average: 5, count: 1 });
    expect((await getProduct('moon-bracelet'))?.rating).toBeNull();
  });

  it('publishes straight away when auto-publish is on', async () => {
    await saveSetting('reviews', { autoPublish: true });
    const saved = await review({ productId: bracelet, rating: 4 });
    expect(saved.status).toBe('published');
    expect(saved.publishedAt).not.toBeNull();
    expect((await getProduct('moon-bracelet'))?.rating).toEqual({ average: 4, count: 1 });
  });
});
