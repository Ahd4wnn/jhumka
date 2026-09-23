/**
 * Instagram feed through the official "Instagram API with Instagram Login" — reading your own
 * professional account needs no App Review. The owner pastes a token generated in the Meta App
 * Dashboard; the server renews it weekly (tokens last 60 days), pulls the latest posts every
 * 30 minutes and copies each image into /media, so visitors never load anything from Meta.
 */
import { desc, eq, notInArray } from 'drizzle-orm';
import { getDb, hasDatabase } from './db/client';
import { instagramPosts, type MediaRef } from './db/schema';
import { deleteMedia, MAX_UPLOAD_BYTES, processImage } from './media';
import { DEFAULT_SETTINGS, getSettings, saveSetting, type InstagramSettings } from './settings';

const API = 'https://graph.instagram.com';
export const FEED_SIZE = 12;
const DAY = 86_400_000;
const RENEW_AFTER_MS = 7 * DAY;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const http: Fetcher = (url, init) => fetch(url, init);

export interface IgMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] };
}

export interface FeedPost {
  id: string;
  permalink: string;
  caption: string | null;
  mediaType: string;
  image: MediaRef;
}

export class InstagramError extends Error {}

async function call<T>(path: string, params: Record<string, string>, f: Fetcher): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await f(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new InstagramError(
      e.code === 190
        ? 'The Instagram token is invalid or has expired. Generate a new one in the Meta App Dashboard and connect again.'
        : `Instagram said: ${e.message ?? `HTTP ${res.status}`}`,
    );
  }
  return body as T;
}

/** The picture for a post: reels use their cover image, albums their first item. */
export function imageUrlOf(m: IgMedia): string | null {
  if (m.media_type === 'VIDEO') return m.thumbnail_url ?? null;
  if (m.media_type === 'CAROUSEL_ALBUM') {
    const first = m.children?.data?.[0];
    const child = first ? (first.media_type === 'VIDEO' ? first.thumbnail_url : first.media_url) : undefined;
    return m.media_url ?? child ?? null;
  }
  return m.media_url ?? null;
}

/** Images are only ever downloaded from Instagram's own CDNs. */
export function isInstagramCdn(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function download(url: string, f: Fetcher): Promise<Buffer> {
  if (!isInstagramCdn(url)) throw new InstagramError('Instagram returned an unexpected image address.');
  const res = await f(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new InstagramError(`Could not download a post image (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new InstagramError('A post image is too large to copy.');
  return buf;
}

async function update(patch: Partial<InstagramSettings>) {
  await saveSetting('instagram', { ...(await getSettings()).instagram, ...patch });
}

let feedCache: { at: number; value: FeedPost[] } | null = null;

/** Checks the token, remembers the account, and pulls the posts straight away. */
export async function connectInstagram(token: string, f: Fetcher = http) {
  const me = await call<{ id: string; user_id?: string; username: string }>('/me', { fields: 'user_id,username', access_token: token }, f);
  const now = Date.now();
  await update({
    accessToken: token,
    userId: me.user_id ?? me.id,
    username: me.username,
    tokenRefreshedAt: new Date(now).toISOString(),
    // Dashboard tokens last 60 days; the exact expiry is known after the first renewal.
    tokenExpiresAt: new Date(now + 60 * DAY).toISOString(),
    lastError: null,
  });
  return syncInstagram(f);
}

export async function disconnectInstagram() {
  const gone = await getDb().delete(instagramPosts).returning({ image: instagramPosts.image });
  await Promise.all(gone.map((r) => deleteMedia(r.image.path)));
  await saveSetting('instagram', DEFAULT_SETTINGS.instagram);
  feedCache = null;
}

/** Mirrors the latest FEED_SIZE posts: new ones are downloaded, deleted ones removed. */
export async function syncInstagram(f: Fetcher = http): Promise<{ added: number; removed: number; failed: number }> {
  const { accessToken } = (await getSettings()).instagram;
  if (!accessToken) throw new InstagramError('Instagram is not connected.');
  try {
    const { data } = await call<{ data: IgMedia[] }>(
      '/me/media',
      {
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}',
        limit: String(FEED_SIZE),
        access_token: accessToken,
      },
      f,
    );
    const latest = data.slice(0, FEED_SIZE);
    const db = getDb();
    const have = new Set((await db.select({ id: instagramPosts.id }).from(instagramPosts)).map((r) => r.id));

    let added = 0;
    let failed = 0;
    for (const m of latest) {
      if (have.has(m.id)) {
        await db.update(instagramPosts).set({ caption: m.caption ?? null, permalink: m.permalink }).where(eq(instagramPosts.id, m.id));
        continue;
      }
      const url = imageUrlOf(m);
      if (!url) continue;
      try {
        const image = await processImage(await download(url, f), 'instagram');
        await db
          .insert(instagramPosts)
          .values({ id: m.id, permalink: m.permalink, caption: m.caption ?? null, mediaType: m.media_type, image, postedAt: new Date(m.timestamp) })
          .onConflictDoNothing();
        added++;
      } catch (err) {
        failed++;
        console.error('[instagram] post', m.id, err instanceof Error ? err.message : err);
      }
    }

    const keep = latest.map((m) => m.id);
    const gone = await db
      .delete(instagramPosts)
      .where(keep.length ? notInArray(instagramPosts.id, keep) : undefined)
      .returning({ image: instagramPosts.image });
    await Promise.all(gone.map((r) => deleteMedia(r.image.path)));

    await update({ lastSyncAt: new Date().toISOString(), lastError: failed ? `${failed} post image(s) could not be copied; will retry.` : null });
    feedCache = null;
    return { added, removed: gone.length, failed };
  } catch (err) {
    await update({ lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Renews the 60-day token once a week (Instagram allows it after 24 h), so it never lapses. */
export async function renewInstagramToken(f: Fetcher = http, now = Date.now()): Promise<boolean> {
  const cfg = (await getSettings()).instagram;
  if (!cfg.accessToken) return false;
  if (cfg.tokenRefreshedAt && now - Date.parse(cfg.tokenRefreshedAt) < RENEW_AFTER_MS) return false;
  const r = await call<{ access_token: string; expires_in: number }>('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: cfg.accessToken }, f);
  await update({ accessToken: r.access_token, tokenRefreshedAt: new Date(now).toISOString(), tokenExpiresAt: new Date(now + r.expires_in * 1000).toISOString() });
  return true;
}

/** Background job (every 30 minutes). */
export async function instagramTick() {
  if (!(await getSettings()).instagram.accessToken) return;
  await renewInstagramToken().catch((err) => update({ lastError: err instanceof Error ? err.message : String(err) }));
  await syncInstagram().catch(() => {
    /* recorded in settings.lastError, shown in the admin */
  });
}

/** Latest posts for the storefront (cached for 5 minutes; cleared on every sync). */
export async function getInstagramFeed(limit = 6): Promise<FeedPost[]> {
  if (!hasDatabase()) return [];
  if (!feedCache || Date.now() - feedCache.at > 5 * 60_000) {
    try {
      const rows = await getDb()
        .select({ id: instagramPosts.id, permalink: instagramPosts.permalink, caption: instagramPosts.caption, mediaType: instagramPosts.mediaType, image: instagramPosts.image })
        .from(instagramPosts)
        .orderBy(desc(instagramPosts.postedAt))
        .limit(FEED_SIZE);
      feedCache = { at: Date.now(), value: rows };
    } catch (err) {
      console.error('[instagram] feed', err);
      return [];
    }
  }
  return feedCache.value.slice(0, limit);
}

/** Connection status for the admin (never includes the token). */
export async function instagramStatus() {
  const cfg = (await getSettings()).instagram;
  const posts = hasDatabase() ? await getInstagramFeed(FEED_SIZE) : [];
  return {
    connected: Boolean(cfg.accessToken),
    username: cfg.username,
    tokenExpiresAt: cfg.tokenExpiresAt,
    lastSyncAt: cfg.lastSyncAt,
    lastError: cfg.lastError,
    posts: posts.map((p) => ({ id: p.id, permalink: p.permalink, image: p.image })),
  };
}
