import type { CatalogProduct } from '@atlas/contracts';

import type { Locale } from './i18n';

export type ProductSort = 'recommended' | 'price-asc' | 'price-desc' | 'fastest' | 'newest';
type CatalogOffer = CatalogProduct['offers'][number];

export function offerTotal(offer: CatalogOffer): number {
  // Destination-specific shipping is unknown until checkout; never sort by legacy offer fees.
  return offer.priceMinor;
}

export function compareOffers(left: CatalogOffer, right: CatalogOffer): number {
  const availability = Number(right.availableQuantity > 0) - Number(left.availableQuantity > 0);
  if (availability !== 0) return availability;
  return offerTotal(left) - offerTotal(right) || left.handlingDays - right.handlingDays;
}

export function bestOffer(product: CatalogProduct): CatalogOffer {
  const [offer] = [...product.offers].sort(compareOffers);
  if (!offer) throw new Error('Catalog contract requires at least one offer');
  return offer;
}

export function sortProducts(
  products: readonly CatalogProduct[],
  sort: ProductSort,
): CatalogProduct[] {
  const sorted = [...products];
  if (sort === 'price-asc') {
    return sorted.sort((left, right) => offerTotal(bestOffer(left)) - offerTotal(bestOffer(right)));
  }
  if (sort === 'price-desc') {
    return sorted.sort((left, right) => offerTotal(bestOffer(right)) - offerTotal(bestOffer(left)));
  }
  if (sort === 'fastest') {
    return sorted.sort(
      (left, right) => bestOffer(left).handlingDays - bestOffer(right).handlingDays,
    );
  }
  return sorted;
}

export function parseSort(value: string | undefined): ProductSort {
  if (value === 'price-asc' || value === 'price-desc' || value === 'fastest' || value === 'newest')
    return value;
  return 'recommended';
}

export function formatMoney(amountMinor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    // Whole dinars, or both centime digits (4 500,50 DA, not 4 500,5 DA), as in the app.
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(amountMinor / 100)
    // The narrow space Intl uses between thousands is nearly invisible in Manrope.
    .replace(/\u202f/g, '\u00a0');
}

export function categoryImage(slug: string): string {
  const supported = new Set(['phones', 'kitchen', 'beauty', 'fashion', 'home', 'auto', 'baby']);
  return supported.has(slug) ? `/assets/category-${slug}.png` : '/assets/hero-mobile-bazaar.png';
}

/** A whole-dinar price bound from the URL (`min`/`max`), or undefined when absent or invalid. */
/** A commune id from the URL (the API checks it exists). */
export function parseCommune(value: string | undefined): string | undefined {
  const id = value?.trim().toLowerCase();
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : undefined;
}

export function parsePriceBound(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,8}$/.test(value.trim())) return undefined;
  const dinars = Number(value.trim());
  // The API accepts prices up to 2 000 000 000 centimes (20 000 000 DA).
  return dinars <= 20_000_000 ? dinars : undefined;
}
