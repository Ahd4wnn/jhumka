/** One shared connection pool per process (server, scripts and tests). */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

export type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __jhumkaSql?: postgres.Sql; __jhumkaDb?: DB };

function connectionUrl(): string {
  const url = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL;
  if (!url) {
    throw new Error(
      env.NODE_ENV === 'test'
        ? 'TEST_DATABASE_URL is not set (see .env.example).'
        : 'DATABASE_URL is not set. Run scripts/db/create.sql and add DATABASE_URL to .env (see .env.example).',
    );
  }
  return url;
}

export function getSql(): postgres.Sql {
  // Reused across Vite HMR reloads in dev so we don't leak connection pools.
  g.__jhumkaSql ??= postgres(connectionUrl(), { max: 10, idle_timeout: 30, onnotice: () => {} });
  return g.__jhumkaSql;
}

export function getDb(): DB {
  g.__jhumkaDb ??= drizzle(getSql(), { schema, casing: 'snake_case' });
  return g.__jhumkaDb;
}

export const hasDatabase = () => Boolean(env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL);

export { schema };
