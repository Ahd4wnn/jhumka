/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_INSTAGRAM_HANDLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts on /admin and /api/admin when the session is valid. */
    admin?: import('./server/auth/session').AdminSession;
  }
}
