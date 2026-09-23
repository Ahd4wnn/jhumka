/**
 * Pure pricing rules (no I/O) — unit-tested in tests/pricing.test.ts.
 * Every amount is in paise.
 */
export const MAX_QTY_PER_LINE = 10;
export const MIN_ORDER_PAISE = 100; // Razorpay's minimum is ₹1.

export interface CouponRule {
  code: string;
  type: 'percent' | 'flat';
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface ShippingRule {
  flatPaise: number;
  freeAbovePaise: number | null;
}

export type CouponResult = { ok: true; discountPaise: number } | { ok: false; reason: string };

export function couponDiscount(subtotalPaise: number, coupon: CouponRule, now = new Date()): CouponResult {
  if (!coupon.isActive) return { ok: false, reason: 'This code is no longer active.' };
  if (coupon.startsAt && now < coupon.startsAt) return { ok: false, reason: 'This code is not active yet.' };
  if (coupon.endsAt && now > coupon.endsAt) return { ok: false, reason: 'This code has expired.' };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return { ok: false, reason: 'This code has been fully redeemed.' };
  if (subtotalPaise < coupon.minOrderPaise) {
    return { ok: false, reason: `Add ₹${Math.ceil((coupon.minOrderPaise - subtotalPaise) / 100)} more to use this code.` };
  }
  let discount = coupon.type === 'percent' ? Math.floor((subtotalPaise * Math.min(100, Math.max(0, coupon.value))) / 100) : coupon.value;
  if (coupon.maxDiscountPaise != null) discount = Math.min(discount, coupon.maxDiscountPaise);
  discount = Math.max(0, Math.min(discount, subtotalPaise));
  return { ok: true, discountPaise: discount };
}

export function shippingFor(amountAfterDiscountPaise: number, rule: ShippingRule): number {
  if (rule.freeAbovePaise != null && amountAfterDiscountPaise >= rule.freeAbovePaise) return 0;
  return Math.max(0, rule.flatPaise);
}

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

export function computeTotals(lines: { unitPricePaise: number; qty: number }[], discountPaise: number, shipping: ShippingRule): Totals {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.unitPricePaise * l.qty, 0);
  const discount = Math.max(0, Math.min(discountPaise, subtotalPaise));
  const shippingPaise = shippingFor(subtotalPaise - discount, shipping);
  return { subtotalPaise, discountPaise: discount, shippingPaise, totalPaise: subtotalPaise - discount + shippingPaise };
}

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or null if it isn't one. */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export const isPincode = (s: string) => /^[1-9]\d{5}$/.test(s.trim());
