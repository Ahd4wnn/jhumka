/** Applies pending SQL migrations from ./drizzle. `npm run db:migrate` (NODE_ENV=test → test DB). */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, getSql } from '../../src/server/db/client';

const started = Date.now();
await migrate(getDb(), { migrationsFolder: 'drizzle' });
console.log(`✓ Database is up to date (${Date.now() - started} ms).`);
await getSql().end();
