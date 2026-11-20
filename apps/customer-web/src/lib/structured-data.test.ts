import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogProduct } from '@atlas/contracts';
import { breadcrumbJsonLd, jsonForScript, productJsonLd, websiteJsonLd } from './structured-data.ts';

const offer = (id: string, priceMinor: number, availableQuantity: number, preorder = false) => ({
  id,
  seller: { id, slug: `s-${id}`, name: `Boutique ${id}` },
  priceMinor,
  currency: 'DZD' as const,
  availableQuantity,
  handlingDays: 2,
  ...(preorder ? { preorder: { minDays: 10, maxDays: 20, origin: null } } : {}),
});
const product = {
  id: 'p',
  slug: 'p-1',
  title: { fr: 'Plateau </script><script>alert(1)</script>', ar: 'صينية', en: 'Tray' },
  description: { fr: 'Cuivre.', ar: 'نحاس.' },
  category: { slug: 'cuisine', title: { fr: 'Cuisine', ar: 'المطبخ' } },
  imageUrl: '/media/a.webp',
  gallery: ['/media/b.webp'],
  specs: [{ key: 'brand', value: 'Atlas' }],
  offers: [offer('1', 250000, 3), offer('2', 199900, 0), offer('3', 300000, 0, true)],
} as unknown as CatalogProduct;

test('offers, prices, availability and images come from the product', () => {
  const data = productJsonLd(product, null, 'en', 'https://shop.example');
  assert.equal(data.name, 'Tray');
  assert.equal(data.description, 'Cuivre.');
  assert.deepEqual(data.image, ['https://shop.example/media/a.webp', 'https://shop.example/media/b.webp']);
  assert.deepEqual(data.brand, { '@type': 'Brand', name: 'Atlas' });
  const offers = data.offers as Record<string, unknown>;
  assert.equal(offers['@type'], 'AggregateOffer');
  assert.equal(offers.lowPrice, '1999.00');
  assert.equal(offers.highPrice, '3000.00');
  const list = offers.offers as Record<string, unknown>[];
  assert.deepEqual(
    list.map((item) => item.availability),
    ['https://schema.org/InStock', 'https://schema.org/OutOfStock', 'https://schema.org/PreOrder'],
  );
  assert.equal(data.url, 'https://shop.example/product/p-1?lang=en');
});

test('a rating appears only with real reviews', () => {
  assert.equal(productJsonLd(product, null, 'fr', '').aggregateRating, undefined);
  const none = { count: 0, average: null, stars: [0, 0, 0, 0, 0] as [number, number, number, number, number] };
  assert.equal(productJsonLd(product, none, 'fr', '').aggregateRating, undefined);
  const some = { count: 3, average: 4.333, stars: [0, 0, 0, 2, 1] as [number, number, number, number, number] };
  assert.deepEqual(productJsonLd(product, some, 'fr', '').aggregateRating, {
    '@type': 'AggregateRating',
    ratingValue: 4.3,
    reviewCount: 3,
    bestRating: 5,
    worstRating: 1,
  });
});

test('seller text cannot close the script tag', () => {
  const json = jsonForScript(productJsonLd(product, null, 'fr', ''));
  assert.ok(!json.includes('</script>'));
  assert.equal((JSON.parse(json) as { name: string }).name, product.title.fr);
});

test('site search and breadcrumbs use absolute URLs', () => {
  const site = websiteJsonLd('https://shop.example', 'atlas dz');
  assert.equal(
    (site.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate,
    'https://shop.example/search?query={search_term_string}',
  );
  const trail = breadcrumbJsonLd('https://shop.example', [
    { name: 'atlas dz', path: '/' },
    { name: 'Cuisine', path: '/category/cuisine' },
  ]);
  assert.deepEqual(
    (trail.itemListElement as { position: number; item: string }[]).map((i) => [i.position, i.item]),
    [
      [1, 'https://shop.example/'],
      [2, 'https://shop.example/category/cuisine'],
    ],
  );
});
