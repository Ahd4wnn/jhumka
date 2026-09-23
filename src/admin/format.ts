import type { OrderStatus } from './api';

export const inr = (paise: number | null | undefined, opts: { compact?: boolean } = {}) => {
  if (paise == null) return '—';
  const rupees = paise / 100;
  if (opts.compact && Math.abs(rupees) >= 100000) return `₹${(rupees / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(rupees);
};

/** "349" / "349.50" → paise; empty → null. */
export const toPaise = (rupees: string): number | null => {
  const clean = rupees.replace(/[,₹\s]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const fromPaise = (paise: number | null | undefined) => (paise == null ? '' : String(paise % 100 ? (paise / 100).toFixed(2) : paise / 100));

const dtf = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const df = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const dateTime = (s: string | null | undefined) => (s ? dtf.format(new Date(s)) : '—');
export const date = (s: string | null | undefined) => (s ? df.format(new Date(s)) : '—');

export function ago(s: string | null | undefined): string {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return date(s);
}

export const STATUS: Record<OrderStatus, { label: string; tone: 'solid' | 'soft' | 'outline' | 'muted' }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'muted' },
  payment_failed: { label: 'Payment failed', tone: 'muted' },
  paid: { label: 'New', tone: 'solid' },
  packed: { label: 'Packed', tone: 'soft' },
  shipped: { label: 'Shipped', tone: 'outline' },
  delivered: { label: 'Delivered', tone: 'outline' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'muted' },
};

export const phone = (p: string) => p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
