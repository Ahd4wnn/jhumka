// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
// One switch for the domain: canonical URLs, sitemap, OG tags and robots.txt all derive from this.
const site = (env.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, '');

export default defineConfig({
  site,
  // One Node server: storefront pages render per request (from a cached catalogue),
  // plus the checkout, Razorpay and admin APIs.
  output: 'server',
  adapter: node({ mode: 'standalone', bodySizeLimit: 25 * 1024 * 1024 }),
  trailingSlash: 'ignore',
  // Keep v6 HTML-aware whitespace handling so inline text keeps its spaces.
  compressHTML: true,
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  security: {
    // Off on purpose: behind nginx the app speaks http, so Astro's check would compare the
    // browser's https Origin against its own http URL and reject every form post (reviews,
    // photo uploads). src/middleware.ts does the same check against the forwarded Host instead.
    checkOrigin: false,
  },
  server: {
    port: 4321,
    host: '127.0.0.1',
  },
  integrations: [react({ include: ['**/admin/**'] })],
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle the admin's libraries at startup: found later (when an admin page loads) they make Vite
    // re-bundle mid-session, and pages already open then fail with "504 Outdated Optimize Dep".
    optimizeDeps: {
      include: ['react-router', '@tanstack/react-query', 'lucide-react', 'recharts', 'motion', 'gsap', 'gsap/ScrollTrigger', 'lenis'],
    },
    ssr: {
      // Native / CommonJS server-only packages stay external to the SSR bundle.
      external: ['@node-rs/argon2', 'sharp', 'pdfkit', 'postgres', 'razorpay', 'nodemailer'],
    },
  },
});
