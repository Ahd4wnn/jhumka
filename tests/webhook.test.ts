/** Razorpay webhook: a temporary failure must not be acknowledged, or Razorpay never retries it. */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const { markOrderPaid } = vi.hoisted(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET ||= 'whsec_test';
  return { markOrderPaid: vi.fn() };
});
vi.mock('@/server/commerce/orders', () => ({ markOrderPaid, markPaymentFailed: vi.fn(), addEvent: vi.fn() }));

const { POST } = await import('@/pages/api/webhooks/razorpay');
const { env } = await import('@/server/env');
const { HttpError } = await import('@/server/http');

const captured = (orderId: string) => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: orderId } } } });
  const signature = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');
  const request = new Request('http://localhost/api/webhooks/razorpay', { method: 'POST', body, headers: { 'x-razorpay-signature': signature } });
  return POST({ request } as Parameters<typeof POST>[0]) as Promise<Response>;
};

describe('Razorpay webhook', () => {
  it('acknowledges a payment it recorded', async () => {
    markOrderPaid.mockResolvedValueOnce({ changed: true });
    expect((await captured('order_A')).status).toBe(200);
  });
  it('acknowledges events for orders it does not know (test events)', async () => {
    markOrderPaid.mockRejectedValueOnce(new HttpError(404, 'Order not found for this payment.'));
    expect((await captured('order_unknown')).status).toBe(200);
  });
  it('asks Razorpay to retry when saving the payment fails', async () => {
    markOrderPaid.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    expect((await captured('order_B')).status).toBe(500);
  });
});
