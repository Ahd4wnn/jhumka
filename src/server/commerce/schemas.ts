import { z } from 'zod';
import { isPincode, MAX_QTY_PER_LINE, normalizeIndianMobile } from './pricing';

export const cartItems = z
  .array(z.object({ slug: z.string().min(1).max(120), qty: z.number().int().min(1).max(MAX_QTY_PER_LINE) }))
  .min(1, 'Your bag is empty.')
  .max(30);

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number.' });
    return n ?? '';
  });

const text = (label: string, max = 120) => z.string().trim().min(1, `Enter your ${label}.`).max(max);

export const address = z.object({
  line1: text('house / street', 160),
  line2: z.string().trim().max(160).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  city: text('city', 80),
  state: text('state', 80),
  pincode: z.string().trim().refine(isPincode, 'Enter a 6-digit pincode.'),
});

export const checkoutRequest = z.object({
  items: cartItems,
  name: text('full name', 80),
  phone,
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v == null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address.'),
  address,
  note: z.string().trim().max(500).optional(),
  couponCode: z.string().trim().max(40).optional(),
  utm: z.record(z.string(), z.string().max(120)).optional(),
});

export const quoteRequest = z.object({ items: cartItems, couponCode: z.string().trim().max(40).optional() });

export const verifyRequest = z.object({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

export const trackRequest = z.object({ number: z.string().trim().max(20), phone });

/** Review form fields (sent as multipart alongside the photos). */
const badLink = 'This review link is not valid. Please open it again from your order page.';
const needRating = 'Choose a star rating.';
const needBody = 'Tell us a little more (at least 10 characters).';
const needName = 'Add the name to show with your review.';
export const reviewRequest = z.object({
  number: z.string(badLink).trim().toUpperCase().min(4, badLink).max(20, badLink),
  token: z.string(badLink).min(16, badLink).max(100, badLink),
  productId: z.uuid(badLink),
  rating: z.coerce.number(needRating).int(needRating).min(1, needRating).max(5, needRating),
  title: z.string().trim().max(80, 'Keep the headline under 80 characters.').optional(),
  body: z.string(needBody).trim().min(10, needBody).max(2000, 'Please keep it under 2000 characters.'),
  authorName: z.string(needName).trim().min(1, needName).max(40, 'Keep the name under 40 characters.'),
});
