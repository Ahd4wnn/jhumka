import type { APIRoute } from 'astro';
import { isRazorpayLive, hasRazorpay } from '@/server/commerce/razorpay';
import { requireAdmin } from '@/server/admin/guard';
import { handle, json } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  const user = requireAdmin(locals);
  return json({ user, payments: { configured: hasRazorpay(), live: isRazorpayLive() } });
});
