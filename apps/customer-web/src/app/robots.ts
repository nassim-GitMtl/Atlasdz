import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const origin = process.env['CUSTOMER_WEB_ORIGIN'];
  if (process.env['ATLAS_LIVE_CHECKOUT'] !== 'true') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/account',
        '/cart',
        '/checkout',
        '/orders',
        '/notifications',
        '/support',
        '/login',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
      ],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
