import assert from 'node:assert/strict';
import test from 'node:test';

import type { CatalogProduct } from '@atlas/contracts';

import { bestOffer, formatMoney, sortProducts } from './catalog-view.ts';

const product = {
  id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74519',
  slug: 'sample-product',
  title: { fr: 'Produit', ar: 'منتج' },
  description: { fr: 'Description', ar: 'الوصف' },
  category: { slug: 'kitchen', title: { fr: 'Cuisine', ar: 'المطبخ' } },
  imageUrl: '/assets/product-air-fryer.png',
  offers: [
    {
      id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74520',
      seller: {
        id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74521',
        slug: 'seller-one',
        name: 'Seller One',
      },
      priceMinor: 10_000,
      currency: 'DZD',
      availableQuantity: 0,
      handlingDays: 1,
      deliveryFeeMinor: 0,
    },
    {
      id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74522',
      seller: {
        id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74523',
        slug: 'seller-two',
        name: 'Seller Two',
      },
      priceMinor: 12_000,
      currency: 'DZD',
      availableQuantity: 4,
      handlingDays: 2,
      deliveryFeeMinor: 500,
    },
  ],
} satisfies CatalogProduct;

test('bestOffer favors an available offer over a cheaper unavailable offer', () => {
  assert.equal(bestOffer(product).seller.slug, 'seller-two');
});

test('sortProducts uses item price without guessing destination shipping', () => {
  const availableOffer = product.offers[1];
  assert.ok(availableOffer);
  const cheaper = {
    ...product,
    id: '018f0c12-8c71-7a4b-9f2a-7f56a3e74524',
    slug: 'cheaper-product',
    offers: [{ ...availableOffer, priceMinor: 5_000, deliveryFeeMinor: 900_000 }],
  } satisfies CatalogProduct;
  assert.deepEqual(
    sortProducts([product, cheaper], 'price-asc').map((item) => item.slug),
    ['cheaper-product', 'sample-product'],
  );
});

test('formatMoney interprets contract values as minor DZD units', () => {
  assert.match(formatMoney(1_250_000, 'fr'), /12[\s\u202f]?500/);
  assert.match(formatMoney(450_050, 'fr'), /4[\s\u202f]?500,50/);
});
