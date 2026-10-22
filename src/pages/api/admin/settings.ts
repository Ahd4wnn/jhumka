import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin, requireOwner } from '@/server/admin/guard';
import { getSettings, saveSetting } from '@/server/settings';
import { handle, HttpError, json, readJson } from '@/server/http';

export const GET: APIRoute = handle(async ({ locals }) => {
  const admin = requireAdmin(locals);
  const s = await getSettings();
  // Staff can see store settings but never the alert keys. The Instagram token is never sent
  // to the browser at all (Admin → Settings → Instagram shows its status instead).
  const { instagram: _token, ...rest } = s;
  const masked = { ...s.alerts, telegramBotToken: mask(s.alerts.telegramBotToken) };
  return json({ settings: admin.role === 'owner' ? rest : { ...rest, alerts: masked } });
});

const MASK = '••••••';
const mask = (secret: string) => (secret ? MASK : '');

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
      telegramEnabled: z.boolean(),
      telegramBotToken: z
        .string()
        .trim()
        .regex(/^(\d{5,15}:[\w-]{30,60}|••••••)?$/, 'Paste the whole token from @BotFather, e.g. 123456789:AAH…'),
      telegramChatIds: z
        .string()
        .trim()
        .regex(/^(-?\d{3,20}([\s,]+-?\d{3,20})*)?$/, 'Chat ids are numbers (groups start with -), separated by commas.'),
    }),
  }),
  z.object({ section: z.literal('reviews'), value: z.object({ autoPublish: z.boolean() }) }),
]);

export const PUT: APIRoute = handle(async ({ locals, request }) => {
  requireOwner(locals);
  const input = await readJson(request, body);
  if (input.section === 'alerts') {
    const saved = (await getSettings()).alerts;
    if (input.value.telegramBotToken === MASK) input.value.telegramBotToken = saved.telegramBotToken;
    if (input.value.telegramEnabled && !(input.value.telegramBotToken && input.value.telegramChatIds)) {
      throw new HttpError(400, 'Add the bot token and at least one chat id before turning Telegram alerts on.');
    }
  }
  await saveSetting(input.section, input.value as never);
  return json({ settings: await getSettings() });
});
