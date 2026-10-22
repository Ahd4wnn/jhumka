import { describe, expect, it } from 'vitest';
import { shipMessage, waLink } from '@/admin/format';

const order = {
  name: '  Priya  Sharma ',
  number: 'JH-1042',
  courier: 'Delhivery',
  trackingNumber: 'DL123456789IN',
  trackingUrl: 'https://www.delhivery.com/track/package/DL123456789IN',
  customerLink: '/order/JH-1042?t=abc_-123',
};

describe('waLink', () => {
  it('keeps only the digits of the phone and encodes the text', () => {
    const link = waLink('+91 98765-43210', 'Hi & bye 💜\nTrack: https://x.in/?a=1');
    expect(link).toBe(`https://wa.me/919876543210?text=${encodeURIComponent('Hi & bye 💜\nTrack: https://x.in/?a=1')}`);
    expect(link).toContain('%26');
    expect(link).toContain('%0A');
    expect(link).not.toMatch(/\?text=.*[\s&#]/);
  });
});

describe('shipMessage', () => {
  it('includes every tracking line when set', () => {
    expect(shipMessage(order, 'https://jhumka.in')).toBe(
      [
        'Hi Priya, your Jhumka order JH-1042 is on its way 💜',
        'Courier: Delhivery',
        'Tracking ID: DL123456789IN',
        'Track: https://www.delhivery.com/track/package/DL123456789IN',
        'Your order: https://jhumka.in/order/JH-1042?t=abc_-123',
        'Thank you for shopping with Jhumka.',
      ].join('\n'),
    );
  });

  it('skips missing lines without leaving blanks', () => {
    const text = shipMessage({ ...order, trackingUrl: null, courier: '' }, 'http://localhost:4321');
    expect(text).toBe(
      [
        'Hi Priya, your Jhumka order JH-1042 is on its way 💜',
        'Tracking ID: DL123456789IN',
        'Your order: http://localhost:4321/order/JH-1042?t=abc_-123',
        'Thank you for shopping with Jhumka.',
      ].join('\n'),
    );
    expect(text).not.toContain('Track:');
    expect(text).not.toContain('\n\n');
  });
});
