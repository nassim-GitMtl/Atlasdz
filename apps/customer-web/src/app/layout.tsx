import { resolveLocale } from '@/lib/i18n';
import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/noto-sans-arabic/index.css';
import './globals.css';
import './redesign.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { ServiceWorker } from '@/components/pwa';

/** Search engines may index the shop only once real orders are open (ATLAS_LIVE_CHECKOUT). */
export function generateMetadata(): Metadata {
  const origin = process.env['CUSTOMER_WEB_ORIGIN'];
  const live = process.env['ATLAS_LIVE_CHECKOUT'] === 'true';
  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: {
      default: 'atlas dz · Marketplace algérienne',
      template: '%s · atlas dz',
    },
    description:
      'Découvrez et comparez les offres de vendeurs algériens avec leurs prix, stocks et conditions de livraison.',
    robots: live ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { siteName: 'atlas dz', type: 'website', locale: 'fr_DZ' },
    // Installable app (see app/manifest.ts): home-screen icon and full-screen on iPhone too.
    applicationName: 'atlas dz',
    appleWebApp: { capable: true, title: 'atlas dz', statusBarStyle: 'default' },
    icons: {
      icon: [
        { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const locale = resolveLocale((await headers()).get('x-atlas-locale'));
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
