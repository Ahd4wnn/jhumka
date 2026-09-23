/**
 * Jhumka database schema (PostgreSQL 18, Drizzle ORM).
 * All money is stored in paise (integer), the unit Razorpay uses.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────── Shared JSON shapes ───────── */
export interface MediaRef {
  /** Storage key; files live at MEDIA_DIR/<key>-<width>.<avif|webp>. `local:` keys are bundled dev photos. */
  path: string;
  alt?: string;
  w?: number;
  h?: number;
}

export interface Address {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
}

/* ───────── Enums & sequences ───────── */
export const productType = pgEnum('product_type', ['necklace', 'bracelet', 'ring', 'earrings', 'set']);
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'payment_failed',
]);
export const adminRole = pgEnum('admin_role', ['owner', 'staff']);
export const discountType = pgEnum('discount_type', ['percent', 'flat']);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);
export const reviewStatus = pgEnum('review_status', ['pending', 'published', 'hidden']);

export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 10001 });
export const invoiceNumberSeq = pgSequence('invoice_number_seq', { startWith: 1 });

/* ───────── Catalogue ───────── */
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  description: text('description'),
  coverPath: text('cover_path'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    sku: text('sku').unique(),
    shortDescription: text('short_description'),
    description: text('description'),
    pricePaise: integer('price_paise'),
    compareAtPaise: integer('compare_at_paise'),
    collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
    productType: productType('product_type').notNull().default('necklace'),
    material: text('material').default('Gold-plated'),
    images: jsonb('images').$type<MediaRef[]>().notNull().default([]),
    /** null = stock not tracked (always available). */
    stockQty: integer('stock_qty'),
    isFeatured: boolean('is_featured').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('products_collection_idx').on(t.collectionId),
    index('products_published_idx').on(t.isPublished, t.sortOrder),
    check('products_price_positive', sql`${t.pricePaise} IS NULL OR ${t.pricePaise} >= 0`),
    check('products_published_needs_price', sql`NOT ${t.isPublished} OR ${t.pricePaise} IS NOT NULL`),
  ],
);

/* ───────── Customers (CRM) ───────── */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** E.164, e.g. +919876543210 — the customer's identity for guest checkout. */
    phone: text('phone').notNull().unique(),
    email: citext('email'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    defaultAddress: jsonb('default_address').$type<Address>(),
    ordersCount: integer('orders_count').notNull().default(0),
    totalSpentPaise: integer('total_spent_paise').notNull().default(0),
    lastOrderAt: ts('last_order_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('customers_email_idx').on(t.email), index('customers_last_order_idx').on(t.lastOrderAt)],
);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: adminRole('role').notNull().default('staff'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token — the raw token only ever lives in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/* ───────── Orders ───────── */
export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: citext('code').notNull().unique(),
  type: discountType('type').notNull(),
  /** percent: 1–100; flat: paise. */
  value: integer('value').notNull(),
  minOrderPaise: integer('min_order_paise').notNull().default(0),
  maxDiscountPaise: integer('max_discount_paise'),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  usageLimit: integer('usage_limit'),
  usedCount: integer('used_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    /** Secret for the confirmation page / resume link. */
    accessToken: text('access_token').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: orderStatus('status').notNull().default('pending_payment'),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: citext('email'),
    shippingAddress: jsonb('shipping_address').$type<Address>().notNull(),
    customerNote: text('customer_note'),
    subtotalPaise: integer('subtotal_paise').notNull(),
    discountPaise: integer('discount_paise').notNull().default(0),
    shippingPaise: integer('shipping_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull(),
    couponCode: citext('coupon_code'),
    razorpayOrderId: text('razorpay_order_id').unique(),
    razorpayPaymentId: text('razorpay_payment_id').unique(),
    razorpaySignature: text('razorpay_signature'),
    paymentMethod: text('payment_method'),
    paidAt: ts('paid_at'),
    invoiceNo: integer('invoice_no').unique(),
    courier: text('courier'),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    packedAt: ts('packed_at'),
    shippedAt: ts('shipped_at'),
    deliveredAt: ts('delivered_at'),
    cancelledAt: ts('cancelled_at'),
    refundedPaise: integer('refunded_paise').notNull().default(0),
    recoveryContactedAt: ts('recovery_contacted_at'),
    utm: jsonb('utm').$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_customer_idx').on(t.customerId),
    index('orders_created_idx').on(t.createdAt),
    check('orders_total_nonneg', sql`${t.totalPaise} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    imagePath: text('image_path'),
    unitPricePaise: integer('unit_price_paise').notNull(),
    qty: integer('qty').notNull(),
    lineTotalPaise: integer('line_total_paise').notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_product_idx').on(t.productId), check('order_items_qty_pos', sql`${t.qty} > 0`)],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** status | payment | note | notification | refund | system */
    type: text('type').notNull(),
    message: text('message').notNull(),
    data: jsonb('data'),
    actorId: uuid('actor_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
);

/* ───────── Reviews ───────── */
/** Customer reviews. Only buyers can write one (from their order page), one per piece per order. */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    /** Name shown on the site, e.g. "Priya S." */
    authorName: text('author_name').notNull(),
    images: jsonb('images').$type<MediaRef[]>().notNull().default([]),
    status: reviewStatus('status').notNull().default('pending'),
    /** Public reply from Jhumka, shown under the review. */
    reply: text('reply'),
    repliedAt: ts('replied_at'),
    publishedAt: ts('published_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('reviews_order_product_idx').on(t.orderId, t.productId),
    index('reviews_product_status_idx').on(t.productId, t.status, t.createdAt),
    index('reviews_status_created_idx').on(t.status, t.createdAt),
    check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

/* ───────── Instagram feed ───────── */
/** Latest posts from the shop's Instagram account, with each image copied into /media. */
export const instagramPosts = pgTable(
  'instagram_posts',
  {
    /** Instagram media id. */
    id: text('id').primaryKey(),
    permalink: text('permalink').notNull(),
    caption: text('caption'),
    /** IMAGE | VIDEO | CAROUSEL_ALBUM */
    mediaType: text('media_type').notNull(),
    image: jsonb('image').$type<MediaRef>().notNull(),
    postedAt: ts('posted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('instagram_posts_posted_idx').on(t.postedAt)],
);

/* ───────── CRM ───────── */
export const customerNotes = pgTable(
  'customer_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('customer_notes_customer_idx').on(t.customerId, t.createdAt)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    dueAt: ts('due_at'),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    assigneeId: uuid('assignee_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    doneAt: ts('done_at'),
    createdAt: createdAt(),
  },
  (t) => [index('tasks_due_idx').on(t.doneAt, t.dueAt)],
);

/* ───────── System ───────── */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),
    body: text('body').notNull(),
    status: notificationStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    sentAt: ts('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_due_idx').on(t.status, t.nextAttemptAt)],
);
