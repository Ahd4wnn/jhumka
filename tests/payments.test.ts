import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyPaymentSignature, verifyWebhookSignature } from '@/server/commerce/razorpay';
import { canTransition, nextStatuses } from '@/server/commerce/status';
import { orderAlertText, telegramChatIds } from '@/server/notify';
import { sendTelegram, telegramChats } from '@/server/notify/telegram';
import { toCsv } from '@/server/admin/reports';

const SECRET = 'test_key_secret';

describe('Razorpay signatures', () => {
  const sign = (s: string, secret = SECRET) => createHmac('sha256', secret).update(s).digest('hex');

  it('accepts a genuine checkout signature', () => {
    expect(verifyPaymentSignature('order_A1', 'pay_B2', sign('order_A1|pay_B2'), SECRET)).toBe(true);
  });
  it('rejects tampered ids, wrong secrets and malformed signatures', () => {
    const sig = sign('order_A1|pay_B2');
    expect(verifyPaymentSignature('order_A1', 'pay_OTHER', sig, SECRET)).toBe(false);
    expect(verifyPaymentSignature('order_A1', 'pay_B2', sign('order_A1|pay_B2', 'other'), SECRET)).toBe(false);
    expect(verifyPaymentSignature('order_A1', 'pay_B2', 'not-hex', SECRET)).toBe(false);
    expect(verifyPaymentSignature('order_A1', 'pay_B2', sig.slice(0, 40), SECRET)).toBe(false);
  });
  it('checks webhook signatures against the exact raw body', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    expect(verifyWebhookSignature(body, sign(body, 'whsec'), 'whsec')).toBe(true);
    expect(verifyWebhookSignature(body + ' ', sign(body, 'whsec'), 'whsec')).toBe(false);
  });
});

describe('order status rules', () => {
  it('follows the fulfilment pipeline', () => {
    expect(canTransition('paid', 'packed')).toBe(true);
    expect(canTransition('packed', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });
  it('blocks impossible jumps', () => {
    expect(canTransition('pending_payment', 'paid')).toBe(false); // only Razorpay can mark paid
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
    expect(nextStatuses('refunded')).toEqual([]);
  });
});

describe('owner order alert', () => {
  it('summarises the order with an admin link', () => {
    const text = orderAlertText(
      {
        number: 'JH-10023',
        totalPaise: 104_700,
        name: 'Priya S',
        phone: '+919876543210',
        couponCode: null,
        shippingAddress: { name: 'Priya S', phone: '+919876543210', line1: '12 MG Road', city: 'Kochi', state: 'Kerala', pincode: '682001' },
      },
      [
        { name: 'Infinity Necklace', qty: 1 },
        { name: 'Tulip Necklace', qty: 2 },
      ],
      'https://jhumka.in',
    );
    expect(text).toContain('JH-10023');
    expect(text).toContain('₹1,047 paid online');
    expect(text).toContain('• Tulip Necklace × 2');
    expect(text).toContain('Kochi, Kerala 682001');
    expect(text).toContain('https://jhumka.in/admin/orders/JH-10023');
  });
});

describe('CSV export', () => {
  it('quotes fields and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['Name', 'Note'], [['Priya, S', '=HYPERLINK("x")']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Priya, S"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('Telegram alerts', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('posts the message to the bot API', async () => {
    const fetch = reply({ ok: true });
    vi.stubGlobal('fetch', fetch);
    await sendTelegram('123:abc', '-1001', 'New order');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: '-1001', text: 'New order' });
  });
  it('fails loudly so the outbox retries', async () => {
    vi.stubGlobal('fetch', reply({ ok: false, description: 'Forbidden: bot was kicked from the group chat' }, 403));
    await expect(sendTelegram('123:abc', '-1001', 'x')).rejects.toThrow('bot was kicked');
  });
  it('lists the chats the bot has seen, newest first, without duplicates', async () => {
    vi.stubGlobal(
      'fetch',
      reply({
        ok: true,
        result: [
          { update_id: 1, message: { chat: { id: 42, first_name: 'Adon' } } },
          { update_id: 2, my_chat_member: { chat: { id: -1001, title: 'Jhumka Orders' } } },
          { update_id: 3, message: { chat: { id: -1001, title: 'Jhumka Orders' } } },
        ],
      }),
    );
    expect(await telegramChats('123:abc')).toEqual([
      { id: '-1001', title: 'Jhumka Orders' },
      { id: '42', title: 'Adon' },
    ]);
  });
  it('splits the chat id list', () => {
    expect(telegramChatIds(' -1001, 42  -1001 7 ')).toEqual(['-1001', '42', '7']);
    expect(telegramChatIds('')).toEqual([]);
  });
});
