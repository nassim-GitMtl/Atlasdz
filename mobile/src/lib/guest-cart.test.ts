import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addGuestLine, buildGuestCart, guestCount, setGuestQuantity } from './guest-cart';
import type { CatalogProduct } from './types';

describe('cart without an account', () => {
  it('adds, caps at 99, changes and removes lines', () => {
    let lines = addGuestLine([], 'o1', 'fryer', 2);
    lines = addGuestLine(lines, 'o1', 'fryer', 120);
    lines = addGuestLine(lines, 'o2', 'kettle', 1);
    assert.deepEqual(
      lines.map((l) => [l.offerId, l.quantity]),
      [
        ['o1', 99],
        ['o2', 1],
      ],
    );
    assert.equal(guestCount(lines), 100);
    assert.equal(setGuestQuantity(lines, 'o2', 3)[1]?.quantity, 3);
    assert.equal(setGuestQuantity(lines, 'o1', 0).length, 1);
  });
  it('prices lines from the catalogue and flags missing or short offers', () => {
    const product = {
      id: 'p1',
      slug: 'fryer',
      title: { fr: 'Friteuse', ar: 'مقلاة' },
      imageUrl: '/assets/x.png',
      offers: [{ id: 'o1', priceMinor: 1000, availableQuantity: 2 }],
    } as unknown as CatalogProduct;
    const cart = buildGuestCart(
      [
        { offerId: 'o1', slug: 'fryer', quantity: 2 },
        { offerId: 'o9', slug: 'fryer', quantity: 1 },
        { offerId: 'o1', slug: 'gone', quantity: 1 },
      ],
      new Map([
        ['fryer', product],
        ['gone', null],
      ]),
    );
    assert.deepEqual(
      cart.items.map((i) => i.state),
      ['AVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE'],
    );
    assert.equal(cart.availableSubtotalMinor, 2000);
    assert.equal(
      buildGuestCart([{ offerId: 'o1', slug: 'fryer', quantity: 5 }], new Map([['fryer', product]]))
        .items[0]?.state,
      'INSUFFICIENT_STOCK',
    );
  });
});
