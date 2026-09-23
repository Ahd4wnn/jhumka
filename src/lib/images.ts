/**
 * Resolves a catalogue image path for rendering:
 * - "local:<slug>/1.jpg" → a bundled photo in src/assets/catalog (dev demo catalogue), optimised by Astro
 * - anything else        → an uploaded photo served from /media in several widths and formats
 */
import type { ImageMetadata } from 'astro';
import { mediaUrl } from './media';

export interface MediaSource {
  kind: 'media';
  path: string;
  w?: number;
  h?: number;
}
export type ResolvedImage = ImageMetadata | MediaSource;

const local = import.meta.glob<{ default: ImageMetadata }>('/src/assets/catalog/**/*.{jpg,jpeg,png,webp,avif}', { eager: true });
const lifestyle = import.meta.glob<{ default: ImageMetadata }>('/src/assets/lifestyle/*.{jpg,jpeg,png,webp,avif}', { eager: true });
const hero = import.meta.glob<{ default: ImageMetadata }>('/src/assets/hero/*.{jpg,jpeg,png,webp,avif}', { eager: true });

export const isMedia = (img: ResolvedImage): img is MediaSource => (img as MediaSource).kind === 'media';

export function resolveImage(path: string | null | undefined, size?: { w?: number; h?: number }): ResolvedImage | null {
  if (!path) return null;
  if (path.startsWith('local:')) return local[`/src/assets/catalog/${path.slice(6)}`]?.default ?? null;
  return { kind: 'media', path, w: size?.w, h: size?.h };
}

/** Largest public URL for an image (Open Graph, JSON-LD). Relative; make absolute with the site URL. */
export function imagePublicUrl(img: ResolvedImage | null): string | null {
  if (!img) return null;
  return isMedia(img) ? mediaUrl(img.path, 1600, 'webp') : img.src;
}

/** Lifestyle / campaign photos for the hero and editorial sections, sorted by filename. */
export function lifestylePhotos(): ImageMetadata[] {
  return Object.keys(lifestyle)
    .sort()
    .map((k) => lifestyle[k].default);
}

/** The home page hero image: the first file in src/assets/hero, if any (replace it to change the hero). */
export function heroImage(): ImageMetadata | null {
  const first = Object.keys(hero).sort()[0];
  return first ? hero[first].default : null;
}
