import { describe, expect, it } from 'vitest';
import { receiptEmail } from '@/server/notify/email';
import { DEFAULT_SETTINGS } from '@/server/settings';

const order = {
  number: 'JH-10023',
  accessToken: 'tok_abc',
  name: 'Priya <b>S</b>',
  subtotalPaise: 72_800,
  discountPaise: 7_280,
  couponCode: 'WELCOME10',
  shippingPaise: 0,
  totalPaise: 65_520,
  shippingAddress: { name: 'Priya S', phone: '+919876543210', line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' },
} as unknown as Parameters<typeof receiptEmail>[0];
const items = [
  { name: 'Infinity Necklace', qty: 1, lineTotalPaise: 34_900 },
  { name: 'Tulip Necklace', qty: 1, lineTotalPaise: 37_900 },
];

describe('receipt email', () => {
  const r = receiptEmail(order, items, 'https://shopjhumka.in', { ...DEFAULT_SETTINGS.business, email: 'hello@shopjhumka.in' });

  it('confirms the order with items, totals and the private order link', () => {
    expect(r.subject).toBe('Your Jhumka order JH-10023 is confirmed');
    expect(r.text).toContain('Infinity Necklace × 1 — ₹349');
    expect(r.text).toContain('Discount (WELCOME10): −₹72.80');
    expect(r.text).toContain('Shipping: Free');
    expect(r.text).toContain('Paid: ₹655.20');
    expect(r.text).toContain('https://shopjhumka.in/order/JH-10023?t=tok_abc');
    expect(r.html).toContain('href="https://shopjhumka.in/order/JH-10023?t=tok_abc"');
  });
  it('escapes customer-entered text in the HTML', () => {
    expect(r.html).not.toContain('<b>S</b>');
    expect(r.html).toContain('Priya');
  });
});
