/** Photo upload (multipart: file, folder). Returns a media reference for a product/collection. */
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/server/admin/guard';
import { MAX_UPLOAD_BYTES, processImage } from '@/server/media';
import { handle, HttpError, json } from '@/server/http';

export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const form = await request.formData().catch(() => {
    throw new HttpError(400, 'Upload a photo file.');
  });
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Upload a photo file.');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'That photo is too large (max 12 MB).');
  const folder = String(form.get('folder') ?? 'products');
  try {
    const media = await processImage(Buffer.from(await file.arrayBuffer()), folder);
    return json({ media }, { status: 201 });
  } catch (err) {
    throw new HttpError(400, err instanceof Error && /image|large/i.test(err.message) ? err.message : 'That file is not a photo we can read (use JPG, PNG or WebP).');
  }
});
