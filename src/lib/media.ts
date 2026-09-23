/**
 * Uploaded photos are stored once per width and format by src/server/media.ts and served
 * from /media. This module only builds URLs, so it is safe on both server and client.
 */
export const MEDIA_WIDTHS = [480, 960, 1600] as const;
export type MediaFormat = 'avif' | 'webp';

export const mediaUrl = (path: string, width: (typeof MEDIA_WIDTHS)[number] = 960, format: MediaFormat = 'webp') =>
  `/media/${path}-${width}.${format}`;

export const mediaSrcset = (path: string, format: MediaFormat) => MEDIA_WIDTHS.map((w) => `${mediaUrl(path, w, format)} ${w}w`).join(', ');
