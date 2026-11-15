import type { MetadataRoute } from 'next';
import { getProductPage } from '@/lib/catalog-api';

export const dynamic = 'force-dynamic';

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
  return [
    { url: `${origin}/`, changeFrequency: 'daily', priority: 1 },
    ...products.map((product) => ({
      url: `${origin}/product/${product.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: { languages: { ar: `${origin}/product/${product.slug}?lang=ar` } },
    })),
    ...['mentions-legales', 'conditions', 'confidentialite'].map((page) => ({
      url: `${origin}/legal/${page}`,
      changeFrequency: 'yearly' as const,
      priority: 0.1,
    })),
  ];
}
