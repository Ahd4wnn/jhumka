/** Tiny fetch client for /api/admin with typed errors and TanStack Query helpers. */
import { QueryClient } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2 },
  },
});

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.', data.details?.fields ?? {});
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export async function uploadPhoto(file: File, folder = 'products') {
  const form = new FormData();
  form.set('file', file);
  form.set('folder', folder);
  return api<{ media: { path: string; w: number; h: number } }>('/media', { method: 'POST', body: form });
}

/* ───────── Shared types (mirror the API) ───────── */
export type OrderStatus = 'pending_payment' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'payment_failed';
export interface Me {
  user: { id: string; email: string; name: string; role: 'owner' | 'staff' };
  payments: { configured: boolean; live: boolean };
}
export interface MediaRef {
  path: string;
  alt?: string;
  w?: number;
  h?: number;
}
export interface Product {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  pricePaise: number | null;
  compareAtPaise: number | null;
  collectionId: string | null;
  productType: 'necklace' | 'bracelet' | 'ring' | 'earrings' | 'set';
  material: string | null;
  images: MediaRef[];
  stockQty: number | null;
  isFeatured: boolean;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface Collection {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  coverPath: string | null;
  sortOrder: number;
  isPublished: boolean;
  productCount?: number;
}
export interface OrderRow {
  id: string;
  number: string;
  status: OrderStatus;
  name: string;
  phone: string;
  city: string;
  totalPaise: number;
  createdAt: string;
  paidAt: string | null;
  items: number;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  ordersCount: number;
  totalSpentPaise: number;
  lastOrderAt: string | null;
  createdAt: string;
  defaultAddress: { city: string; state: string; pincode: string } | null;
}
export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}
export interface Task {
  id: string;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  orderNumber: string | null;
  assignee: string | null;
}
export type ReviewStatus = 'pending' | 'published' | 'hidden';
export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  images: MediaRef[];
  status: ReviewStatus;
  reply: string | null;
  repliedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  product: { id: string; name: string; slug: string };
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
}
