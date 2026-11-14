import '@fontsource-variable/manrope/index.css';
import '@fontsource-variable/noto-sans-arabic/index.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { ServiceWorker } from '@/components/pwa';

export const metadata: Metadata = {
  title: { default: 'Espace vendeur · atlas dz', template: '%s · atlas dz' },
  description: 'Vos offres et leur publication sur Atlas DZ.',
  robots: { index: false, follow: false },
  // Installable app (see app/manifest.ts): home-screen icon and full-screen on iPhone too.
  applicationName: 'atlas vendeur',
  appleWebApp: { capable: true, title: 'atlas vendeur', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#faf8f0',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const locale = (await headers()).get('x-atlas-locale') === 'ar' ? 'ar' : 'fr';
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
