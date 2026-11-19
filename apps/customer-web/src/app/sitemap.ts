import type { MetadataRoute } from 'next';
import { getCategories, getProductPage } from '@/lib/catalog-api';

export const dynamic = 'force-dynamic';

/** French is the default page; Arabic and English are the same URL with `?lang=`. */
const languages = (url: string) => ({
  languages: { fr: url, ar: `${url}?lang=ar`, en: `${url}?lang=en` },
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env['CUSTOMER_WEB_ORIGIN'];
  if (!origin || process.env['ATLAS_LIVE_CHECKOUT'] !== 'true') return [];
  // Every product, page by page (at most 50 000, the sitemap limit).
  const products = [];
  for (let page = 1; page <= 500; page += 1) {
    const batch = await getProductPage({ page, limit: 100 }).catch(() => null);
    if (batch === null) break;
    products.push(...batch.items);
    if (page * batch.pageSize >= batch.total || batch.items.length === 0) break;
  }
  const categories = await getCategories().catch(() => []);
  // Stores that currently sell something.
  const stores = [
    ...new Set(products.flatMap((product) => product.offers.map((offer) => offer.seller.slug))),
  ];
  const entry = (
    path: string,
    changeFrequency: 'daily' | 'weekly' | 'yearly',
    priority: number,
  ) => ({
    url: `${origin}${path}`,
    changeFrequency,
    priority,
    alternates: languages(`${origin}${path}`),
  });
  return [
    entry('/', 'daily', 1),
    ...categories.map((category) => entry(`/category/${category.slug}`, 'daily', 0.8)),
    ...products.map((product) => entry(`/product/${product.slug}`, 'weekly', 0.7)),
    ...stores.map((slug) => entry(`/store/${slug}`, 'weekly', 0.5)),
    ...['mentions-legales', 'conditions', 'confidentialite'].map((page) =>
      entry(`/legal/${page}`, 'yearly', 0.1),
    ),
  ];
}
