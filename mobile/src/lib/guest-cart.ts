import type { CartLine, CatalogProduct, CustomerCart } from './types';

/** Cart of a shopper who is not signed in: kept on the phone until checkout or sign-in. */
export interface GuestLine {
  readonly offerId: string;
  readonly slug: string;
  readonly quantity: number;
}
export const GUEST_CART_KEY = 'atlas.guestCart';
export const GUEST_CART_LINES = 50;

export const guestCount = (lines: readonly GuestLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/** Adds to a line (at most 99), or appends it while the cart has room. */
export function addGuestLine(
  lines: readonly GuestLine[],
  offerId: string,
  slug: string,
  quantity: number,
): GuestLine[] {
  const current = lines.find((line) => line.offerId === offerId);
  if (current) {
    return lines.map((line) =>
      line.offerId === offerId
        ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
        : line,
    );
  }
  if (lines.length >= GUEST_CART_LINES || quantity < 1) return [...lines];
  return [...lines, { offerId, slug, quantity: Math.min(99, quantity) }];
}

/** Sets a line's quantity; 0 removes it. */
export function setGuestQuantity(
  lines: readonly GuestLine[],
  offerId: string,
  quantity: number,
): GuestLine[] {
  if (quantity <= 0) return lines.filter((line) => line.offerId !== offerId);
  return lines.map((line) =>
    line.offerId === offerId ? { ...line, quantity: Math.min(99, quantity) } : line,
  );
}

/** The local cart in the signed-in cart's shape, priced from the live catalogue. */
export function buildGuestCart(
  lines: readonly GuestLine[],
  products: ReadonlyMap<string, CatalogProduct | null>,
): CustomerCart {
  const items: CartLine[] = lines.map((line) => {
    const product = products.get(line.slug) ?? null;
    const offer = product?.offers.find((candidate) => candidate.id === line.offerId) ?? null;
    return {
      offerId: line.offerId,
      quantity: line.quantity,
      state: !offer
        ? 'UNAVAILABLE'
        : offer.availableQuantity < line.quantity
          ? 'INSUFFICIENT_STOCK'
          : 'AVAILABLE',
      product: product
        ? { id: product.id, slug: product.slug, title: product.title, imageUrl: product.imageUrl }
        : null,
      offer,
      lineSubtotalMinor: offer ? offer.priceMinor * line.quantity : null,
    };
  });
  return {
    version: 0,
    items,
    currency: 'DZD',
    availableSubtotalMinor: items.reduce(
      (sum, item) => sum + (item.state === 'AVAILABLE' ? (item.lineSubtotalMinor ?? 0) : 0),
      0,
    ),
  };
}
