import type { CartLine, DeliveryDestination, DeliveryFees } from './types';

export function sellerCartGroups(lines: readonly CartLine[]) {
  const groups = new Map<
    string,
    {
      id: string;
      seller: NonNullable<CartLine['offer']>['seller'] | null;
      items: CartLine[];
      subtotalMinor: number;
      valid: boolean;
    }
  >();
  for (const line of lines) {
    const seller = line.offer?.seller ?? null;
    const id = seller?.id ?? 'unavailable';
    const group = groups.get(id) ?? { id, seller, items: [], subtotalMinor: 0, valid: true };
    group.items.push(line);
    group.valid &&= line.state === 'AVAILABLE' && line.offer !== null;
    if (line.state === 'AVAILABLE' && line.offer)
      group.subtotalMinor += line.offer.priceMinor * line.quantity;
    groups.set(id, group);
  }
  return [...groups.values()];
}

export type SellerCartGroup = ReturnType<typeof sellerCartGroups>[number];

/** Reject incomplete or inconsistent fee responses; missing values are never free shipping. */
export function parseDeliveryFees(
  value: unknown,
  sellerIds: readonly string[],
): DeliveryFees['items'] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items))
    throw new Error('INVALID_DELIVERY_FEES');
  const items = value.items as DeliveryFees['items'];
  if (
    items.length !== sellerIds.length ||
    new Set(items.map((item) => item?.sellerId)).size !== items.length
  )
    throw new Error('INVALID_DELIVERY_FEES');
  for (const item of items) {
    if (
      !item ||
      !sellerIds.includes(item.sellerId) ||
      typeof item.available !== 'boolean' ||
      (item.available
        ? !Number.isSafeInteger(item.shippingFeeMinor) ||
          item.shippingFeeMinor! < 0 ||
          item.shippingFeeMinor! > 2_000_000_000
        : item.shippingFeeMinor !== null)
    ) {
      throw new Error('INVALID_DELIVERY_FEES');
    }
  }
  return items;
}

export function cartDeliveryTotal(
  groups: readonly SellerCartGroup[],
  fees: DeliveryFees['items'] | undefined,
): number | null {
  if (!groups.length || !fees || groups.some((group) => !group.valid || !group.seller)) return null;
  let total = 0;
  for (const group of groups) {
    const fee = fees.find((item) => item.sellerId === group.id);
    if (
      !fee?.available ||
      fee.shippingFeeMinor === null ||
      !Number.isSafeInteger(fee.shippingFeeMinor) ||
      fee.shippingFeeMinor < 0
    )
      return null;
    total += group.subtotalMinor + fee.shippingFeeMinor;
  }
  return Number.isSafeInteger(total) ? total : null;
}

export const destinationGroup = (destination: DeliveryDestination) =>
  destination.wilaya?.id ?? 'test';

/** Every change which can alter the displayed estimate invalidates the previous response. */
export const cartDeliveryKey = (lines: readonly CartLine[]) =>
  JSON.stringify(
    lines.map((line) => [
      line.offerId,
      line.quantity,
      line.state,
      line.offer?.seller.id,
      line.offer?.priceMinor,
    ]),
  );
