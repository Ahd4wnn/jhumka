/**
 * CallMeBot free WhatsApp API — personal use, messages go only to the number that activated it
 * (the owner). One-time setup: send "I allow callmebot to send me messages" on WhatsApp to
 * +34 623 91 22 04, then paste the API key it replies with into Admin → Settings.
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/
 */
export async function sendCallMeBotWhatsApp(phone: string, apiKey: string, text: string): Promise<void> {
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', phone.replace(/[^\d+]/g, ''));
  url.searchParams.set('text', text);
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!res.ok || /apikey is invalid|error|not allowed|wrong/i.test(body)) {
    throw new Error(`CallMeBot ${res.status}: ${body.slice(0, 200) || 'no response'}`);
  }
}
