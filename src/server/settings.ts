/** Store settings (key → JSON), cached in memory and invalidated on write. */
import { getDb } from './db/client';
import { settings } from './db/schema';

export interface StoreSettings {
  shipping: { flatPaise: number; freeAbovePaise: number | null };
  business: { name: string; legalName: string; address: string; email: string; phone: string; gstin: string | null; state: string };
  invoice: { prefix: string };
  inventory: { lowStockThreshold: number };
  /** telegramChatIds: comma-separated chat ids (a group id covers every founder in it). */
  alerts: { telegramEnabled: boolean; telegramBotToken: string; telegramChatIds: string };
  /** autoPublish: new reviews go live without approval. */
  reviews: { autoPublish: boolean };
  /** Instagram feed connection (token from the Meta App Dashboard) and sync status. */
  instagram: InstagramSettings;
}

export interface InstagramSettings {
  accessToken: string;
  userId: string | null;
  username: string | null;
  tokenRefreshedAt: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  shipping: { flatPaise: 0, freeAbovePaise: null },
  business: { name: 'Jhumka', legalName: 'Jhumka', address: '', email: '', phone: '+91 62381 93133', gstin: null, state: 'Kerala' },
  invoice: { prefix: 'JH/INV/' },
  inventory: { lowStockThreshold: 3 },
  alerts: { telegramEnabled: false, telegramBotToken: '', telegramChatIds: '' },
  reviews: { autoPublish: false },
  instagram: { accessToken: '', userId: null, username: null, tokenRefreshedAt: null, tokenExpiresAt: null, lastSyncAt: null, lastError: null },
};

let cache: { value: StoreSettings; at: number } | null = null;

export async function getSettings(): Promise<StoreSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await getDb().select().from(settings);
  const merged = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, object>;
  for (const row of rows) {
    if (row.key in merged) merged[row.key] = { ...merged[row.key], ...(row.value as object) };
  }
  cache = { value: merged as unknown as StoreSettings, at: Date.now() };
  return cache.value;
}

export async function saveSetting<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
  await getDb().insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  cache = null;
}
