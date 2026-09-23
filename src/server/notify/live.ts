/** In-process pub/sub that feeds the admin's live event stream (/api/admin/events). */
import { EventEmitter } from 'node:events';

export interface LiveEvent {
  type: 'order.paid' | 'order.updated' | 'notification.failed' | 'review.new';
  orderNumber?: string;
  totalPaise?: number;
  customerName?: string;
  message: string;
  at: string;
}

const g = globalThis as unknown as { __jhumkaLive?: EventEmitter };
const bus = (g.__jhumkaLive ??= new EventEmitter().setMaxListeners(100));

export function publish(event: Omit<LiveEvent, 'at'>) {
  bus.emit('event', { ...event, at: new Date().toISOString() } satisfies LiveEvent);
}

export function subscribe(listener: (e: LiveEvent) => void): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
