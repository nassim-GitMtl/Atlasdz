import type { SellerOrder } from '@atlas/contracts';

export const ORDER_TABS = ['todo', 'shipped', 'closed', 'all'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const TAB_STATUSES: Record<Exclude<OrderTab, 'all'>, readonly SellerOrder['status'][]> = {
  todo: ['AWAITING_SELLER', 'ACCEPTED', 'PREPARING'],
  shipped: ['SHIPPED', 'DELIVERY_REPORTED'],
  closed: ['DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
};

export const parseTab = (value: unknown): OrderTab =>
  ORDER_TABS.includes(value as OrderTab) ? (value as OrderTab) : 'todo';

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Orders in a tab that match a search on the customer name, phone (digits only), order number
 * or product title. Newest first is kept from the API order.
 */
export function filterOrders(
  orders: readonly SellerOrder[],
  tab: OrderTab,
  query: string,
): { items: SellerOrder[]; counts: Record<OrderTab, number> } {
  const needle = fold(query.trim());
  const digits = query.replace(/\D/g, '');
  const matches = (order: SellerOrder) => {
    if (needle === '') return true;
    const contact = order.deliveryContact;
    if (contact && fold(contact.recipientName).includes(needle)) return true;
    if (contact && digits.length >= 3 && contact.phone.replace(/\D/g, '').includes(digits))
      return true;
    if (order.id.startsWith(needle)) return true;
    return order.snapshot.items.some((item) =>
      [item.title.fr, item.title.ar, item.title.en ?? ''].some((title) =>
        fold(title).includes(needle),
      ),
    );
  };
  const found = orders.filter(matches);
  const inTab = (order: SellerOrder, which: OrderTab) =>
    which === 'all' || TAB_STATUSES[which].includes(order.status);
  return {
    items: found.filter((order) => inTab(order, tab)),
    counts: {
      todo: found.filter((order) => inTab(order, 'todo')).length,
      shipped: found.filter((order) => inTab(order, 'shipped')).length,
      closed: found.filter((order) => inTab(order, 'closed')).length,
      all: found.length,
    },
  };
}
