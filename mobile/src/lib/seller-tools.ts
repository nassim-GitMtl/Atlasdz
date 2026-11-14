import { formatDate, formatMoney, localized } from './format';
import type { Strings } from './strings';
import type { Locale, SellerOffer, SellerOrder } from './types';

/** Offers at or below this stock are flagged on the dashboard. */
export const LOW_STOCK = 3;

/** Approved offers running out, the emptiest first. */
export function lowStock(offers: readonly SellerOffer[]): SellerOffer[] {
  return offers
    .filter((offer) => offer.status === 'APPROVED' && offer.availableQuantity <= LOW_STOCK)
    .sort((a, b) => a.availableQuantity - b.availableQuantity);
}

/** Search by customer name, phone digits (3 or more) or the start of the order number. */
export function matchesOrder(order: SellerOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const contact = order.deliveryContact;
  const digits = q.replace(/\D/g, '');
  return (
    order.id.toLowerCase().startsWith(q) ||
    (contact?.recipientName.toLowerCase().includes(q) ?? false) ||
    (digits.length >= 3 && (contact?.phone.replace(/\D/g, '').includes(digits) ?? false))
  );
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Delivered sales per local day over the last `days` days, oldest first: the same rule as the
 * dashboard's "delivered sales" (orders the customer confirmed), dated by that confirmation.
 */
export function dailySales(
  orders: readonly SellerOrder[],
  now: Date,
  days = 14,
): { readonly day: string; readonly totalMinor: number }[] {
  const totals = new Map<string, number>();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  for (let index = 0; index < days; index += 1) {
    totals.set(dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)), 0);
  }
  for (const order of orders) {
    if (order.status !== 'DELIVERED') continue;
    const delivered = order.history.find((entry) => entry.status === 'DELIVERED');
    if (delivered === undefined) continue;
    const key = dayKey(new Date(delivered.occurredAt));
    const total = totals.get(key);
    if (total !== undefined) totals.set(key, total + order.snapshot.totalMinor);
  }
  return [...totals].map(([day, totalMinor]) => ({ day, totalMinor }));
}

/** Plain-text delivery slip for the courier (WhatsApp, SMS or print), in the seller's language. */
export function deliverySlip(order: SellerOrder, t: Strings['slip'], locale: Locale): string {
  const lines = [
    `${t.title} · atlas dz`,
    `${t.order} ${order.id.slice(0, 8).toUpperCase()} · ${formatDate(order.createdAt, locale)}`,
  ];
  const contact = order.deliveryContact;
  if (contact) {
    const destination = order.snapshot.deliveryRate?.destination;
    const place = [
      `${contact.addressLine}, ${contact.city}`,
      destination ? localized(destination.name, locale) : null,
      destination?.wilaya ? localized(destination.wilaya.name, locale) : null,
    ].filter((part): part is string => part !== null);
    lines.push(
      `${t.recipient} : ${contact.recipientName}`,
      `${t.phone} : ${contact.phone}`,
      `${t.address} : ${place.join(' — ')}`,
    );
  }
  lines.push(`${t.items} :`);
  for (const item of order.snapshot.items) {
    lines.push(`- ${localized(item.title, locale)} × ${item.quantity}`);
  }
  lines.push(
    order.paymentState === 'CASH_ON_DELIVERY'
      ? `${t.collect} : ${formatMoney(order.snapshot.totalMinor, locale)}`
      : `${t.collect} : ${t.test}`,
  );
  if (order.shipment) {
    lines.push(`${t.tracking} : ${order.shipment.carrier} ${order.shipment.trackingReference}`);
  }
  return lines.join('\n');
}
