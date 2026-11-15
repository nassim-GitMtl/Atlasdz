import { CreateOfferInputSchema, UpdateOfferInputSchema } from '@atlas/contracts';

export type OfferValues = Readonly<
  Record<'productId' | 'price' | 'quantity' | 'handlingDays' | 'deliveryFee', string> &
    Partial<Record<'preorder' | 'preorderMin' | 'preorderMax' | 'preorderOrigin', string>>
>;
export const emptyOfferValues: OfferValues = {
  productId: '',
  price: '',
  quantity: '',
  handlingDays: '',
  deliveryFee: '',
  preorder: '',
  preorderMin: '',
  preorderMax: '',
  preorderOrigin: '',
};

export function moneyToMinor(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.replace(',', '.').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 2_000_000_000 ? amount : undefined;
}

function integer(value: string): number | undefined {
  return /^\d{1,7}$/.test(value.trim()) ? Number(value) : undefined;
}

/** Pre-order terms when the box is ticked ("yes"); null for an item in stock. */
function preorderOf(values: OfferValues) {
  if (values.preorder !== 'yes') return {};
  const origin = (values.preorderOrigin ?? '').trim();
  return {
    preorder: {
      minDays: integer(values.preorderMin ?? ''),
      maxDays: integer(values.preorderMax ?? ''),
      origin: origin === '' ? null : origin,
    },
  };
}

export function parseOfferValues(values: OfferValues) {
  return CreateOfferInputSchema.safeParse({
    productId: values.productId,
    priceMinor: moneyToMinor(values.price),
    availableQuantity: integer(values.quantity),
    handlingDays: integer(values.handlingDays),
    deliveryFeeMinor: moneyToMinor(values.deliveryFee),
    ...preorderOf(values),
  });
}
export function parseOfferUpdate(values: OfferValues, version: string) {
  return UpdateOfferInputSchema.safeParse({
    expectedVersion: /^\d{1,10}$/.test(version) ? Number(version) : undefined,
    priceMinor: moneyToMinor(values.price),
    availableQuantity: integer(values.quantity),
    handlingDays: integer(values.handlingDays),
    ...preorderOf(values),
  });
}
