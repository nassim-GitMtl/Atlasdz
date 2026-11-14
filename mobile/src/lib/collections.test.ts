import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addressKey,
  canReject,
  canReportFailure,
  categoryImage,
  dinarsText,
  nextSellerAction,
  parseDinars,
  rememberViewed,
  saveAddress,
  sellerOrderFilter,
  sellerSummary,
  sortProducts,
  toggleFavorite,
  type ProductSummary,
  type SavedAddress,
} from './collections';
import type { CatalogProduct, SellerOrder } from './types';

const item = (slug: string, priceMinor = 1000): ProductSummary => ({
  slug,
  title: { fr: slug, ar: slug },
  imageUrl: '/assets/product-placeholder.svg',
  priceMinor,
});

describe('favorites and recently viewed', () => {
  it('toggles a favorite on and off, newest first', () => {
    const one = toggleFavorite([], item('a'));
    const two = toggleFavorite(one, item('b'));
    assert.deepEqual(
      two.map((x) => x.slug),
      ['b', 'a'],
    );
    assert.deepEqual(
      toggleFavorite(two, item('a')).map((x) => x.slug),
      ['b'],
    );
  });
  it('keeps recently viewed unique, newest first and bounded', () => {
    let list: readonly ProductSummary[] = [];
    for (const slug of ['a', 'b', 'c', 'a']) list = rememberViewed(list, item(slug), 3);
    assert.deepEqual(
      list.map((x) => x.slug),
      ['a', 'c', 'b'],
    );
    list = rememberViewed(list, item('d'), 3);
    assert.deepEqual(
      list.map((x) => x.slug),
      ['d', 'a', 'c'],
    );
  });
  it('returns the same list when the product is already first (no write, no render loop)', () => {
    const list = rememberViewed([], item('a'));
    assert.equal(rememberViewed(list, item('a')), list);
    assert.notEqual(rememberViewed(list, item('a', 2000)), list);
  });
});

describe('saved addresses', () => {
  const address = (name: string, destinationId = 'd1'): SavedAddress => ({
    contact: { recipientName: name, phone: '0555123456', addressLine: '12 rue', city: 'Oran' },
    destinationId,
    destinationLabel: 'Commune',
    wilayaId: 'w1',
  });
  it('moves a reused address to the top instead of duplicating it', () => {
    const list = saveAddress(saveAddress([], address('Amina')), address('Karim'));
    const again = saveAddress(list, address(' amina '));
    assert.equal(again.length, 2);
    assert.equal(addressKey(again[0]), addressKey(address('Amina')));
  });
  it('keeps at most eight addresses', () => {
    let list: readonly SavedAddress[] = [];
    for (let i = 0; i < 10; i += 1) list = saveAddress(list, address(`N${i}`, `d${i}`));
    assert.equal(list.length, 8);
  });
});

describe('catalogue helpers', () => {
  const product = (slug: string, prices: number[]) =>
    ({ slug, offers: prices.map((priceMinor) => ({ priceMinor })) }) as unknown as CatalogProduct;
  it('sorts by lowest offer price', () => {
    const list = [product('a', [500, 300]), product('b', [100]), product('c', [900])];
    assert.deepEqual(
      sortProducts(list, 'priceAsc').map((p) => p.slug),
      ['b', 'a', 'c'],
    );
    assert.deepEqual(
      sortProducts(list, 'priceDesc').map((p) => p.slug),
      ['c', 'a', 'b'],
    );
    assert.deepEqual(
      sortProducts(list, 'relevance').map((p) => p.slug),
      ['a', 'b', 'c'],
    );
  });
  it('uses the website category pictures', () => {
    assert.equal(categoryImage('phones'), '/assets/category-phones.png');
    assert.equal(categoryImage('unknown'), '/assets/hero-mobile-bazaar.png');
  });
});

describe('seller order rules', () => {
  it('walks the seller through accept → prepare → ship → delivered', () => {
    assert.equal(nextSellerAction('AWAITING_SELLER'), 'ACCEPT');
    assert.equal(nextSellerAction('ACCEPTED'), 'PREPARE');
    assert.equal(nextSellerAction('PREPARING'), 'SHIP');
    assert.equal(nextSellerAction('SHIPPED'), 'REPORT_DELIVERY');
    assert.equal(nextSellerAction('DELIVERED'), null);
    assert.ok(canReject('AWAITING_SELLER') && !canReject('ACCEPTED'));
    assert.ok(canReportFailure('SHIPPED') && !canReportFailure('PREPARING'));
  });
  it('groups orders and sums delivered sales', () => {
    const order = (status: SellerOrder['status'], totalMinor: number) =>
      ({ status, snapshot: { totalMinor } }) as SellerOrder;
    const orders = [
      order('AWAITING_SELLER', 100),
      order('PREPARING', 200),
      order('SHIPPED', 300),
      order('DELIVERED', 400),
      order('DELIVERED', 600),
      order('CANCELLED', 999),
    ];
    assert.deepEqual(sellerSummary(orders), {
      toAccept: 1,
      toPrepare: 0,
      toShip: 1,
      inDelivery: 1,
      deliveredMinor: 1000,
    });
    assert.equal(sellerOrderFilter('ACCEPTED'), 'active');
    assert.equal(sellerOrderFilter('DELIVERY_REPORTED'), 'shipping');
    assert.equal(sellerOrderFilter('EXPIRED'), 'done');
  });
});

describe('dinar amounts typed by sellers', () => {
  it('reads whole and decimal dinars, rejects the rest', () => {
    assert.equal(parseDinars('4500'), 450000);
    assert.equal(parseDinars('4 500,50'), 450050);
    assert.equal(parseDinars('12.5'), 1250);
    assert.equal(parseDinars('abc'), null);
    assert.equal(parseDinars('1.234'), null);
    assert.equal(dinarsText(450000), '4500');
    assert.equal(dinarsText(450050), '4500.50');
  });
});
