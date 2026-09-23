/**
 * Server configuration, read from process.env. In development the project's .env file is
 * loaded automatically; in production systemd provides the variables (/etc/jhumka.env).
 * Server-only: never import this from client code.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile) && !process.env.JHUMKA_ENV_LOADED) {
  process.loadEnvFile(envFile);
  process.env.JHUMKA_ENV_LOADED = '1';
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.url().optional(),
  TEST_DATABASE_URL: z.url().optional(),
  PUBLIC_SITE_URL: z.url().default('http://localhost:4321'),
  MEDIA_DIR: z.string().default(resolve(process.cwd(), 'media')),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CALLMEBOT_PHONE: z.string().optional(),
  CALLMEBOT_APIKEY: z.string().optional(),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value == null || value === '') throw new Error(`Missing ${String(key)} — add it to .env (see .env.example).`);
  return value as NonNullable<(typeof env)[K]>;
}
