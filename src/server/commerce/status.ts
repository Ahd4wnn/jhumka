/** Order lifecycle — which status changes an admin may make. Unit-tested. */
export const ORDER_STATUSES = ['pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded', 'payment_failed'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'New · paid',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  payment_failed: 'Payment failed',
};

/** Customer-facing wording for the tracking page. */
export const STATUS_PUBLIC: Record<OrderStatus, string> = {
  pending_payment: 'Waiting for payment',
  paid: 'Order confirmed',
  packed: 'Packed and ready to ship',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  payment_failed: 'Payment not completed',
};

const MANUAL: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['cancelled'],
  payment_failed: ['cancelled'],
  paid: ['packed', 'shipped', 'cancelled'],
  packed: ['shipped', 'paid', 'cancelled'],
  shipped: ['delivered', 'packed'],
  delivered: ['shipped'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return MANUAL[from].includes(to);
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return MANUAL[from];
}

/** Orders that count as sales in reports and customer lifetime value. */
export const SALE_STATUSES: OrderStatus[] = ['paid', 'packed', 'shipped', 'delivered'];
