import type { CatalogProduct, DeliveryContact, Localized, SellerOrder } from './types';

/** What the phone keeps about a product for favorites and recently viewed. */
export interface ProductSummary {
  readonly slug: string;
  readonly title: Localized;
  readonly imageUrl: string;
  readonly priceMinor: number;
}

export const summarize = (product: CatalogProduct): ProductSummary => ({
  slug: product.slug,
  title: product.title,
  imageUrl: product.imageUrl,
  priceMinor: Math.min(...product.offers.map((offer) => offer.priceMinor)),
});

/** Adds the product at the front, or removes it when already a favorite. */
export function toggleFavorite(list: readonly ProductSummary[], item: ProductSummary) {
  return list.some((entry) => entry.slug === item.slug)
    ? list.filter((entry) => entry.slug !== item.slug)
    : [item, ...list];
}

/** Most recent first, no duplicates, at most `max` items. */
export function rememberViewed(list: readonly ProductSummary[], item: ProductSummary, max = 12) {
  const first = list[0];
  // Already the latest and unchanged: keep the same list (no storage write, no re-render).
  if (first && first.slug === item.slug && first.priceMinor === item.priceMinor) return list;
  return [item, ...list.filter((entry) => entry.slug !== item.slug)].slice(0, max);
}

/** A delivery address kept on the phone, with the commune it was used for. */
export interface SavedAddress {
  readonly contact: DeliveryContact;
  readonly destinationId: string;
  readonly destinationLabel: string;
  readonly wilayaId: string;
}

export const addressKey = (address: SavedAddress) =>
  [
    address.contact.recipientName.trim().toLowerCase(),
    address.contact.phone,
    address.contact.addressLine.trim().toLowerCase(),
    address.destinationId,
  ].join('|');

/** Newest first; the same address used again moves to the top. At most `max` addresses. */
export function saveAddress(list: readonly SavedAddress[], address: SavedAddress, max = 8) {
  const key = addressKey(address);
  return [address, ...list.filter((entry) => addressKey(entry) !== key)].slice(0, max);
}

export type SortMode = 'relevance' | 'priceAsc' | 'priceDesc';

const lowest = (product: CatalogProduct) =>
  Math.min(...product.offers.map((offer) => offer.priceMinor));

export function sortProducts(products: readonly CatalogProduct[], mode: SortMode) {
  if (mode === 'relevance') return [...products];
  const direction = mode === 'priceAsc' ? 1 : -1;
  return [...products].sort((a, b) => direction * (lowest(a) - lowest(b)));
}

/** The shop website's category pictures (apps/customer-web/src/lib/catalog-view.ts). */
export function categoryImage(slug: string): string {
  const pictured = new Set(['phones', 'kitchen', 'beauty', 'fashion', 'home', 'auto', 'baby']);
  return pictured.has(slug) ? `/assets/category-${slug}.png` : '/assets/hero-mobile-bazaar.png';
}

type Status = SellerOrder['status'];
export type SellerAction = 'ACCEPT' | 'PREPARE' | 'SHIP' | 'REPORT_DELIVERY';

/** The seller's next step for an order (same order of steps as Seller Center). */
export function nextSellerAction(status: Status): SellerAction | null {
  if (status === 'AWAITING_SELLER') return 'ACCEPT';
  if (status === 'ACCEPTED') return 'PREPARE';
  if (status === 'PREPARING') return 'SHIP';
  if (status === 'SHIPPED') return 'REPORT_DELIVERY';
  return null;
}

export const canReject = (status: Status) => status === 'AWAITING_SELLER';
export const canReportFailure = (status: Status) => status === 'SHIPPED';

export type SellerOrderFilter = 'active' | 'shipping' | 'done';

export function sellerOrderFilter(status: Status): SellerOrderFilter {
  if (['AWAITING_SELLER', 'ACCEPTED', 'PREPARING'].includes(status)) return 'active';
  if (['SHIPPED', 'DELIVERY_REPORTED'].includes(status)) return 'shipping';
  return 'done';
}

/** Dashboard figures from the seller's orders. */
export function sellerSummary(orders: readonly SellerOrder[]) {
  const count = (status: Status) => orders.filter((order) => order.status === status).length;
  return {
    toAccept: count('AWAITING_SELLER'),
    toPrepare: count('ACCEPTED'),
    toShip: count('PREPARING'),
    inDelivery: count('SHIPPED') + count('DELIVERY_REPORTED'),
    deliveredMinor: orders
      .filter((order) => order.status === 'DELIVERED')
      .reduce((sum, order) => sum + order.snapshot.totalMinor, 0),
  };
}

/** Dinars typed by a seller (e.g. "4500" or "4 500,50") to the API's minor units. */
export function parseDinars(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const dinarsText = (minor: number) =>
  minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
