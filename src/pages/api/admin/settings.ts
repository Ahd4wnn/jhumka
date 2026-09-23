import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, requireOwner } from '@/server/admin/guard';
import { getSettings, saveSetting } from '@/server/settings';
import { handle, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  const admin = requireAdmin(locals);
  const s = await getSettings();
  // Staff can see store settings but never the alert API key. The Instagram token is never sent
  // to the browser at all (Admin → Settings → Instagram shows its status instead).
  const { instagram: _token, ...rest } = s;
  return json({ settings: admin.role === 'owner' ? rest : { ...rest, alerts: { ...s.alerts, callmebotApiKey: s.alerts.callmebotApiKey ? '••••••' : '' } } });
});

const paise = z.number().int().min(0).max(10_000_000);
const body = z.discriminatedUnion('section', [
  z.object({ section: z.literal('shipping'), value: z.object({ flatPaise: paise, freeAbovePaise: paise.nullable() }) }),
  z.object({
    section: z.literal('business'),
    value: z.object({
      name: z.string().trim().min(1).max(80),
      legalName: z.string().trim().min(1).max(120),
      address: z.string().trim().max(400),
      email: z.string().trim().max(160),
      phone: z.string().trim().max(30),
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'That is not a valid GSTIN.')
        .nullable(),
      state: z.string().trim().min(1).max(60),
    }),
  }),
  z.object({ section: z.literal('invoice'), value: z.object({ prefix: z.string().trim().max(20) }) }),
  z.object({ section: z.literal('inventory'), value: z.object({ lowStockThreshold: z.number().int().min(0).max(1000) }) }),
  z.object({
    section: z.literal('alerts'),
    value: z.object({
      whatsappEnabled: z.boolean(),
      callmebotPhone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Use the full number with country code, e.g. +916238193133.'),
      callmebotApiKey: z.string().trim().max(40),
    }),
  }),
  z.object({ section: z.literal('reviews'), value: z.object({ autoPublish: z.boolean() }) }),
]);

export const PUT: APIRoute = handle(async ({ locals, request }) => {
  requireOwner(locals);
  const input = await readJson(request, body);
  if (input.section === 'alerts' && input.value.callmebotApiKey === '••••••') {
    input.value.callmebotApiKey = (await getSettings()).alerts.callmebotApiKey;
  }
  await saveSetting(input.section, input.value as never);
  return json({ settings: await getSettings() });
});
