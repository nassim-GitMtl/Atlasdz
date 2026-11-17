import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cartDeliveryKey,
  cartDeliveryTotal,
  parseDeliveryFees,
  sellerCartGroups,
} from './cart-delivery';
import type { CartLine } from './types';

const line = (
  seller = 's1',
  quantity = 1,
  price = 1000,
  state: CartLine['state'] = 'AVAILABLE',
): CartLine => ({
  offerId: `${seller}-${price}`,
  quantity,
  state,
  product: null,
  offer: {
    seller: { id: seller, name: seller, slug: seller },
    priceMinor: price,
  } as CartLine['offer'],
  lineSubtotalMinor: state === 'AVAILABLE' ? price * quantity : null,
});
const fee = (sellerId = 's1', shippingFeeMinor: number | null = 500, available = true) => ({
  sellerId,
  shippingFeeMinor,
  available,
});

describe('seller-grouped cart delivery', () => {
  it('charges once per seller, regardless of the number of items or quantities', () => {
    const groups = sellerCartGroups([line('s1', 2), line('s1', 3, 1500), line('s2', 1, 2500)]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.subtotalMinor, 6500);
    assert.equal(cartDeliveryTotal(groups, [fee(), fee('s2', 800)]), 10300);
  });
  it('accepts an explicitly free rate but never substitutes zero for missing fees', () => {
    const groups = sellerCartGroups([line()]);
    assert.equal(cartDeliveryTotal(groups, [fee('s1', 0)]), 1000);
    for (const fees of [undefined, [], [fee('s2')], [fee('s1', null)], [fee('s1', null, false)]]) {
      assert.equal(cartDeliveryTotal(groups, fees), null);
    }
  });
  it('blocks the whole checkout when one seller is unsupported', () => {
    const groups = sellerCartGroups([line(), line('s2')]);
    assert.equal(cartDeliveryTotal(groups, [fee(), fee('s2', null, false)]), null);
  });
  it('keeps unavailable items visible, excludes their prices, and blocks checkout', () => {
    const groups = sellerCartGroups([
      line(),
      line('s1', 5, 2000, 'INSUFFICIENT_STOCK'),
      { ...line('s2'), state: 'UNAVAILABLE', offer: null },
    ]);
    assert.equal(groups[0]?.items.length, 2);
    assert.equal(groups[0]?.subtotalMinor, 1000);
    assert.equal(groups[1]?.seller, null);
    assert.equal(cartDeliveryTotal(groups, [fee()]), null);
    assert.equal(cartDeliveryTotal([], []), null);
  });
  it('changes the estimate identity after quantity, price, availability or seller changes', () => {
    const original = cartDeliveryKey([line()]);
    for (const changed of [
      line('s1', 2),
      line('s1', 1, 1100),
      line('s2'),
      line('s1', 1, 1000, 'UNAVAILABLE'),
    ]) {
      assert.notEqual(cartDeliveryKey([changed]), original);
    }
    assert.equal(cartDeliveryKey([line()]), original);
  });
});

describe('delivery fee response validation', () => {
  it('accepts covered and explicitly uncovered destinations', () => {
    const items = [fee(), fee('s2', null, false)];
    assert.deepEqual(parseDeliveryFees({ items }, ['s1', 's2']), items);
  });
  it('rejects missing, duplicate, unexpected and malformed seller rates', () => {
    for (const response of [
      null,
      {},
      { items: [] },
      { items: [null] },
      { items: [fee('wrong')] },
      { items: [fee(), fee()] },
      { items: [fee('s1', null)] },
      { items: [fee('s1', -1)] },
      { items: [fee('s1', 1.5)] },
      { items: [fee('s1', 2_000_000_001)] },
      { items: [fee('s1', 500, false)] },
      { items: [{ ...fee(), available: 'true' }] },
    ])
      assert.throws(() => parseDeliveryFees(response, ['s1']));
  });
});
