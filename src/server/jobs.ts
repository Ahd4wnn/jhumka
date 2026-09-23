/**
 * Background jobs, started once per server process by the middleware:
 * - deliver pending owner alerts every 20 s
 * - prune expired admin sessions every 6 h
 * - refresh the Instagram feed (and renew its token) every 30 min
 */
import { hasDatabase } from './db/client';
import { pruneExpiredSessions } from './auth/session';
import { processOutbox } from './notify/outbox';
import { instagramTick } from './instagram';

const g = globalThis as unknown as { __jhumkaJobs?: boolean };

export function startBackgroundJobs() {
  if (g.__jhumkaJobs || !hasDatabase() || process.env.NODE_ENV === 'test') return;
  g.__jhumkaJobs = true;
  const safe = (label: string, fn: () => Promise<unknown>) => () => fn().catch((err) => console.error(`[jobs] ${label}:`, err));
  setInterval(safe('outbox', processOutbox), 20_000).unref();
  setInterval(safe('sessions', pruneExpiredSessions), 6 * 60 * 60_000).unref();
  setInterval(safe('instagram', instagramTick), 30 * 60_000).unref();
  setTimeout(safe('outbox', processOutbox), 3_000).unref();
  setTimeout(safe('instagram', instagramTick), 15_000).unref();
}
