/**
 * Instagram feed sync against the real `jhumka_test` database with a fake Instagram API:
 * posts are mirrored (images copied into /media), removed posts are cleaned up, the token renews
 * weekly, and bad tokens are reported without losing the posts already shown.
 */
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import sharp from 'sharp';
import { getDb, getSql, hasDatabase } from '@/server/db/client';
import { instagramPosts } from '@/server/db/schema';
import { mediaFilePath } from '@/server/media';
import { getSettings } from '@/server/settings';
import {
  connectInstagram,
  disconnectInstagram,
  getInstagramFeed,
  imageUrlOf,
  isInstagramCdn,
  renewInstagramToken,
  syncInstagram,
  type IgMedia,
} from '@/server/instagram';

const cdn = (n: string) => `https://scontent-bom1-1.cdninstagram.com/v/${n}.jpg?stp=x`;
const post = (id: string, day: number, extra: Partial<IgMedia> = {}): IgMedia => ({
  id,
  media_type: 'IMAGE',
  media_url: cdn(id),
  permalink: `https://www.instagram.com/p/${id}/`,
  timestamp: `2026-09-${String(day).padStart(2, '0')}T10:00:00+0000`,
  caption: `Post ${id}\nsecond line`,
  ...extra,
});

describe('picking the image for a post', () => {
  it('uses the cover for reels and the first item for albums', () => {
    expect(imageUrlOf(post('a', 1))).toBe(cdn('a'));
    expect(imageUrlOf(post('v', 1, { media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/v.mp4', thumbnail_url: cdn('cover') }))).toBe(cdn('cover'));
    expect(imageUrlOf(post('c', 1, { media_type: 'CAROUSEL_ALBUM', media_url: undefined, children: { data: [{ media_type: 'IMAGE', media_url: cdn('child') }] } }))).toBe(cdn('child'));
  });
  it('only downloads from Instagram’s CDNs', () => {
    expect(isInstagramCdn(cdn('a'))).toBe(true);
    expect(isInstagramCdn('https://scontent.xx.fbcdn.net/a.jpg')).toBe(true);
    expect(isInstagramCdn('http://scontent.cdninstagram.com/a.jpg')).toBe(false);
    expect(isInstagramCdn('https://evil.example/cdninstagram.com.jpg')).toBe(false);
    expect(isInstagramCdn('https://cdninstagram.com.evil.example/a.jpg')).toBe(false);
  });
});

describe.skipIf(!hasDatabase())('Instagram feed sync', () => {
  let jpg: Buffer;
  let feed: IgMedia[] = [];
  let tokenValid = true;
  const calls: string[] = [];

  const fake = async (url: string): Promise<Response> => {
    const u = new URL(url);
    calls.push(u.pathname);
    if (u.hostname !== 'graph.instagram.com') return new Response(new Uint8Array(jpg), { status: 200 });
    if (!tokenValid) return Response.json({ error: { message: 'Invalid OAuth access token', code: 190 } }, { status: 400 });
    if (u.pathname === '/me') return Response.json({ id: '1784', user_id: '1784', username: 'jhumka.in_' });
    if (u.pathname === '/me/media') return Response.json({ data: feed });
    if (u.pathname === '/refresh_access_token') return Response.json({ access_token: 'renewed-token-xxxxxxxxxxxx', token_type: 'bearer', expires_in: 5_184_000 });
    return new Response('not found', { status: 404 });
  };

  beforeAll(async () => {
    const db = getDb();
    await migrate(db, { migrationsFolder: 'drizzle' });
    await db.execute(sql`truncate instagram_posts, settings`);
    jpg = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#7d46ab' } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await disconnectInstagram();
    await getSql().end();
  });

  it('connects, then mirrors the posts with their images', async () => {
    feed = [
      post('p3', 20),
      post('p2', 18, { media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/v.mp4', thumbnail_url: cdn('p2-cover') }),
      post('p1', 15, { media_type: 'CAROUSEL_ALBUM' }),
    ];
    const result = await connectInstagram('first-token-xxxxxxxxxxxxxxxx', fake);
    expect(result).toEqual({ added: 3, removed: 0, failed: 0 });

    const cfg = (await getSettings()).instagram;
    expect(cfg).toMatchObject({ username: 'jhumka.in_', userId: '1784', accessToken: 'first-token-xxxxxxxxxxxxxxxx', lastError: null });

    const shown = await getInstagramFeed(6);
    expect(shown.map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
    expect(shown[1].mediaType).toBe('VIDEO');
    for (const p of shown) expect(existsSync(mediaFilePath(`${p.image.path}-480.webp`)!)).toBe(true);
  });

  it('adds new posts and removes deleted ones (and their images)', async () => {
    const before = await getInstagramFeed(6);
    const removedImage = before.find((p) => p.id === 'p1')!.image.path;
    feed = [post('p4', 21), feed[0], feed[1]];
    expect(await syncInstagram(fake)).toEqual({ added: 1, removed: 1, failed: 0 });
    expect((await getInstagramFeed(6)).map((p) => p.id)).toEqual(['p4', 'p3', 'p2']);
    expect(existsSync(mediaFilePath(`${removedImage}-480.webp`)!)).toBe(false);
  });

  it('skips images that are not on Instagram’s CDN', async () => {
    feed = [post('p5', 22, { media_url: 'https://evil.example/p5.jpg' }), ...feed];
    const result = await syncInstagram(fake);
    expect(result.failed).toBe(1);
    expect((await getSettings()).instagram.lastError).toMatch(/could not be copied/);
  });

  it('renews the token weekly, not before', async () => {
    expect(await renewInstagramToken(fake)).toBe(false);
    expect(await renewInstagramToken(fake, Date.now() + 8 * 86_400_000)).toBe(true);
    const cfg = (await getSettings()).instagram;
    expect(cfg.accessToken).toBe('renewed-token-xxxxxxxxxxxx');
    expect(Date.parse(cfg.tokenExpiresAt!)).toBeGreaterThan(Date.now() + 60 * 86_400_000);
  });

  it('reports an expired token and keeps showing the posts it has', async () => {
    tokenValid = false;
    await expect(syncInstagram(fake)).rejects.toThrow(/expired/);
    expect((await getSettings()).instagram.lastError).toMatch(/expired/);
    expect((await getInstagramFeed(6)).length).toBe(3);
    tokenValid = true;
  });

  it('disconnecting removes the posts and forgets the token', async () => {
    await disconnectInstagram();
    expect(await getDb().select().from(instagramPosts)).toHaveLength(0);
    expect((await getSettings()).instagram.accessToken).toBe('');
    expect(await getInstagramFeed(6)).toEqual([]);
  });
});
