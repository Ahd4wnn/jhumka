import { describe, expect, it } from 'vitest';
import { computeTotals, couponDiscount, normalizeIndianMobile, shippingFor, isPincode, type CouponRule } from '@/server/commerce/pricing';

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: 'WELCOME10',
  type: 'percent',
  value: 10,
  minOrderPaise: 0,
  maxDiscountPaise: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  isActive: true,
  ...over,
});

describe('couponDiscount', () => {
  it('takes a percentage, rounding down to the paisa', () => {
    expect(couponDiscount(34_950, coupon())).toEqual({ ok: true, discountPaise: 3_495 });
    expect(couponDiscount(999, coupon({ value: 15 }))).toEqual({ ok: true, discountPaise: 149 });
  });
  it('caps a percentage at the maximum discount', () => {
    expect(couponDiscount(500_000, coupon({ value: 50, maxDiscountPaise: 20_000 }))).toEqual({ ok: true, discountPaise: 20_000 });
  });
  it('never discounts more than the subtotal', () => {
    expect(couponDiscount(9_900, coupon({ type: 'flat', value: 50_000 }))).toEqual({ ok: true, discountPaise: 9_900 });
  });
  it('enforces the minimum order', () => {
    const r = couponDiscount(40_000, coupon({ minOrderPaise: 49_900 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/₹99 more/);
  });
  it('rejects inactive, expired, future and used-up codes', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    expect(couponDiscount(10_000, coupon({ isActive: false }), now).ok).toBe(false);
    expect(couponDiscount(10_000, coupon({ endsAt: new Date('2026-09-19T00:00:00Z') }), now).ok).toBe(false);
    expect(couponDiscount(10_000, coupon({ startsAt: new Date('2026-09-21T00:00:00Z') }), now).ok).toBe(false);
    expect(couponDiscount(10_000, coupon({ usageLimit: 5, usedCount: 5 }), now).ok).toBe(false);
    expect(couponDiscount(10_000, coupon({ usageLimit: 5, usedCount: 4 }), now).ok).toBe(true);
  });
});

describe('shipping and totals', () => {
  it('charges the flat fee below the free-shipping threshold', () => {
    expect(shippingFor(49_900, { flatPaise: 6_000, freeAbovePaise: 50_000 })).toBe(6_000);
    expect(shippingFor(50_000, { flatPaise: 6_000, freeAbovePaise: 50_000 })).toBe(0);
    expect(shippingFor(10_000, { flatPaise: 0, freeAbovePaise: null })).toBe(0);
  });
  it('applies the discount before checking free shipping', () => {
    const t = computeTotals([{ unitPricePaise: 30_000, qty: 2 }], 15_000, { flatPaise: 6_000, freeAbovePaise: 50_000 });
    expect(t).toEqual({ subtotalPaise: 60_000, discountPaise: 15_000, shippingPaise: 6_000, totalPaise: 51_000 });
  });
});

describe('customer input', () => {
  it('normalises Indian mobile numbers', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
  });
  it('validates pincodes', () => {
    expect(isPincode('682001')).toBe(true);
    expect(isPincode('082001')).toBe(false);
    expect(isPincode('68200')).toBe(false);
  });
});
