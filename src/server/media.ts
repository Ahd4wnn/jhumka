/**
 * Photo uploads: every image is decoded by sharp (which also rejects non-images), rotated
 * per EXIF, and written as AVIF + WebP at each width in MEDIA_WIDTHS. The original is not kept.
 * Files: MEDIA_DIR/<folder>/<yyyymm>/<id>-<width>.<avif|webp>
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { MEDIA_WIDTHS } from '@/lib/media';
import { env } from './env';
import type { MediaRef } from './db/schema';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const SAFE_FOLDER = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const MEDIA_FILE = /^[a-z0-9][a-z0-9/_-]{2,120}-(480|960|1600)\.(avif|webp)$/;

export const mediaRoot = () => resolve(env.MEDIA_DIR);

/** Absolute path for a public media file name, or null if it escapes MEDIA_DIR. */
export function mediaFilePath(file: string): string | null {
  if (!MEDIA_FILE.test(file) || file.includes('..')) return null;
  const root = mediaRoot();
  const full = normalize(join(root, file));
  return full.startsWith(root + sep) ? full : null;
}

export async function processImage(input: Buffer, folder = 'products'): Promise<MediaRef> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new Error('That photo is too large (max 12 MB).');
  const safeFolder = SAFE_FOLDER.test(folder) ? folder : 'misc';
  const base = sharp(input, { limitInputPixels: 60_000_000, failOn: 'error' }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('That file is not an image we can read.');

  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const path = `${safeFolder}/${month}/${randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
  const outDir = dirname(join(mediaRoot(), path));
  await mkdir(outDir, { recursive: true });

  // EXIF-rotated dimensions of the largest rendition.
  const rotated = meta.orientation && meta.orientation >= 5;
  const [ow, oh] = rotated ? [meta.height, meta.width] : [meta.width, meta.height];
  const scale = Math.min(1, MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1] / ow);

  await Promise.all(
    MEDIA_WIDTHS.flatMap((w) => {
      const resized = base.clone().resize({ width: w, withoutEnlargement: true });
      return [
        resized.clone().avif({ quality: 55, effort: 4 }).toFile(join(mediaRoot(), `${path}-${w}.avif`)),
        resized.clone().webp({ quality: 82 }).toFile(join(mediaRoot(), `${path}-${w}.webp`)),
      ];
    }),
  );

  return { path, w: Math.round(ow * scale), h: Math.round(oh * scale) };
}

/** Removes every rendition of an uploaded photo (missing files are ignored). */
export async function deleteMedia(path: string) {
  if (path.startsWith('local:')) return;
  const full = mediaFilePath(`${path}-480.webp`);
  if (!full) return;
  const dir = dirname(full);
  const stem = full.slice(dir.length + 1).replace(/-480\.webp$/, '-');
  const files = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(files.filter((f) => f.startsWith(stem)).map((f) => unlink(join(dir, f)).catch(() => {})));
}
