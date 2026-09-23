/**
 * Customer review submission (multipart: order number + token, productId, rating, title, body,
 * authorName, up to 4 `photos`). Only the order's own secret link can review its pieces.
 */
import type { APIRoute } from 'astro';
import { reviewRequest } from '@/server/commerce/schemas';
import { MAX_UPLOAD_BYTES } from '@/server/media';
import { MAX_REVIEW_PHOTOS, submitReview } from '@/server/reviews';
import { clientIp, handle, HttpError, json, rateLimit } from '@/server/http';

const FIELDS = ['number', 'token', 'productId', 'rating', 'title', 'body', 'authorName'] as const;

export const POST: APIRoute = handle(async ({ request, clientAddress }) => {
  rateLimit(`review:${clientIp(request, clientAddress)}`, 12, 60 * 60_000);
  const form = await request.formData().catch(() => {
    throw new HttpError(400, 'Please fill in the review form.');
  });

  const raw = Object.fromEntries(FIELDS.map((k) => [k, typeof form.get(k) === 'string' && form.get(k) !== '' ? form.get(k) : undefined]));
  const parsed = reviewRequest.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    throw new HttpError(400, Object.values(fields)[0] ?? 'Please check the form.', { fields });
  }
  rateLimit(`review-order:${parsed.data.number}`, 10, 60 * 60_000);

  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_REVIEW_PHOTOS) throw new HttpError(400, `Add up to ${MAX_REVIEW_PHOTOS} photos.`);
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) throw new HttpError(413, 'Each photo must be under 12 MB.');

  const review = await submitReview({
    ...parsed.data,
    photos: await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))),
  });
  return json({ review: { id: review.id, status: review.status } }, { status: 201 });
});
