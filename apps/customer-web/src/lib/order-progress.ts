import type { SellerOrder } from '@atlas/contracts';
export function orderProgress(orders: readonly Pick<SellerOrder, 'status'>[]) {
  if (orders.length === 0) throw new Error('An order must have seller orders');
  if (orders.every((o) => o.status === 'DELIVERED')) return 'DELIVERED';
  const closed = orders.filter((o) =>
    ['DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(o.status),
  ).length;
  if (closed === orders.length) return 'CLOSED';
  if (closed > 0) return 'PARTIALLY_CLOSED';
  if (orders.every((o) => o.status === 'AWAITING_SELLER')) return 'AWAITING_SELLER';
  if (orders.every((o) => o.status === 'DELIVERY_REPORTED')) return 'DELIVERY_REPORTED';
  return 'IN_PROGRESS';
}
