import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env['CUSTOMER_WEB_ORIGIN'];
  if (!origin || process.env['ATLAS_LIVE_CHECKOUT'] !== 'true') return [];
  const products = await getProducts().catch(() => []);
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
