/**
 * Razorpay: server-side order creation, payment/webhook signature checks and refunds.
 * The client is swappable so tests can run without network access.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { env, requireEnv } from '../env';

export interface RazorpayGateway {
  createOrder(input: { amount: number; receipt: string; notes?: Record<string, string> }): Promise<{ id: string; amount: number; currency: string }>;
  fetchPayment(paymentId: string): Promise<{ id: string; method?: string; status?: string; amount?: number; order_id?: string }>;
  fetchOrderPayments(orderId: string): Promise<{ id: string; method?: string; status?: string }[]>;
  refund(paymentId: string, input: { amount: number; notes?: Record<string, string> }): Promise<{ id: string; amount: number; status?: string }>;
}

let client: RazorpayGateway | null = null;

export function setRazorpayGateway(gateway: RazorpayGateway | null) {
  client = gateway;
}

export function getRazorpay(): RazorpayGateway {
  if (client) return client;
  const rzp = new Razorpay({ key_id: requireEnv('RAZORPAY_KEY_ID'), key_secret: requireEnv('RAZORPAY_KEY_SECRET') });
  client = {
    createOrder: async ({ amount, receipt, notes }) => {
      const o = await rzp.orders.create({ amount, currency: 'INR', receipt, notes, payment_capture: true });
      return { id: o.id, amount: Number(o.amount), currency: o.currency };
    },
    fetchPayment: async (id) => {
      const p = await rzp.payments.fetch(id);
      return { id: p.id, method: p.method, status: p.status, amount: Number(p.amount), order_id: p.order_id };
    },
    fetchOrderPayments: async (orderId) => {
      const { items } = await rzp.orders.fetchPayments(orderId);
      return items.map((p) => ({ id: p.id, method: p.method, status: p.status }));
    },
    refund: async (paymentId, { amount, notes }) => {
      const r = await rzp.payments.refund(paymentId, { amount, notes });
      return { id: r.id, amount: Number(r.amount), status: r.status };
    },
  };
  return client;
}

export const isRazorpayLive = () => (env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_live_');
export const hasRazorpay = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

function safeEqualHex(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received.toLowerCase(), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret = requireEnv('RAZORPAY_KEY_SECRET')): boolean {
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = env.RAZORPAY_WEBHOOK_SECRET): boolean {
  // No secret configured: reject cleanly (a 400 Razorpay can read) instead of throwing a 500.
  if (!secret) {
    console.error('[razorpay] RAZORPAY_WEBHOOK_SECRET is not set — webhook rejected.');
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
