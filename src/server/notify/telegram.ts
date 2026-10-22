/**
 * Telegram Bot API — order alerts to the founders. One-time setup: create a bot with @BotFather,
 * add it to a group with the co-founders, then paste the token and the group's chat id into
 * Admin → Settings (the "Find chats" button lists the chats the bot has seen).
 * https://core.telegram.org/bots/api#sendmessage
 */
const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(api(token, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!res.ok || !body?.ok) throw new Error(`Telegram ${res.status}: ${body?.description ?? 'no response'}`);
}

/** Chats the bot has seen recently (Telegram keeps updates for 24 h), newest first. */
export async function telegramChats(token: string): Promise<{ id: string; title: string }[]> {
  const res = await fetch(api(token, 'getUpdates'), { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: Record<string, { chat?: TgChat }>[] } | null;
  if (!res.ok || !body?.ok) throw new Error(`Telegram ${res.status}: ${body?.description ?? 'no response'}`);
  const chats = new Map<string, string>();
  for (const update of [...(body.result ?? [])].reverse()) {
    for (const part of Object.values(update)) {
      const chat = typeof part === 'object' && part ? part.chat : undefined;
      if (chat && !chats.has(String(chat.id))) chats.set(String(chat.id), chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '');
    }
  }
  return [...chats].map(([id, title]) => ({ id, title: title || id }));
}

interface TgChat {
  id: number;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}
