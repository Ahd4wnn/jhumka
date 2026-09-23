/** Validation for admin write APIs. Money fields are paise (integers). */
import { z } from 'zod';
import { PRODUCT_TYPES } from '@/lib/types';

const slug = z
  .string()
  .trim()
  .min(1, 'Add a web address.')
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only.');
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const paise = z.number().int().min(0).max(100_000_000);

export const mediaRef = z.object({
  path: z.string().min(3).max(200),
  alt: z.string().trim().max(200).optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
});

export const productInput = z
  .object({
    name: z.string().trim().min(1, 'Give the piece a name.').max(120),
    slug,
    sku: optText(40),
    shortDescription: optText(200),
    description: optText(4000),
    pricePaise: paise.nullable(),
    compareAtPaise: paise.nullable(),
    collectionId: z.uuid().nullable(),
    productType: z.enum(PRODUCT_TYPES),
    material: optText(80),
    images: z.array(mediaRef).max(12),
    stockQty: z.number().int().min(0).max(100_000).nullable(),
    isFeatured: z.boolean(),
    isPublished: z.boolean(),
    sortOrder: z.number().int().min(-10_000).max(10_000),
  })
  .refine((p) => !p.isPublished || p.pricePaise != null, { message: 'Add a price before publishing.', path: ['pricePaise'] });

export const productPatch = z.object({
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  stockQty: z.number().int().min(0).max(100_000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const collectionInput = z.object({
  name: z.string().trim().min(1, 'Give the collection a name.').max(80),
  slug,
  tagline: optText(160),
  description: optText(1000),
  coverPath: z.string().max(200).nullable(),
  sortOrder: z.number().int().min(-10_000).max(10_000),
  isPublished: z.boolean(),
});

export const couponInput = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, 'Codes need at least 3 characters.')
      .max(30)
      .regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores.'),
    type: z.enum(['percent', 'flat']),
    value: z.number().int().positive(),
    minOrderPaise: paise,
    maxDiscountPaise: paise.nullable(),
    startsAt: z.coerce.date().nullable(),
    endsAt: z.coerce.date().nullable(),
    usageLimit: z.number().int().positive().nullable(),
    isActive: z.boolean(),
  })
  .refine((c) => c.type !== 'percent' || c.value <= 100, { message: 'A percentage can be at most 100.', path: ['value'] })
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, { message: 'The end date must be after the start date.', path: ['endsAt'] });
