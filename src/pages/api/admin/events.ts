/** Server-sent events: new paid orders and alert failures, pushed live to open admin tabs. */
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/server/admin/guard';
import { subscribe } from '@/server/notify/live';

export const GET: APIRoute = async ({ locals, request }) => {
  requireAdmin(locals);
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send('retry: 5000\n\n');
      const off = subscribe((e) => send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      const ping = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        clearInterval(ping);
        off();
      };
      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
};
