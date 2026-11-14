import type { MetadataRoute } from 'next';

/**
 * Web app manifest: lets customers install the shop from the browser on Android, iPhone and
 * desktop (home-screen icon, full-screen window). public/sw.js adds the offline page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'atlas dz · Marketplace algérienne',
    short_name: 'atlas dz',
    description:
      'Comparez les offres de vendeurs algériens et commandez avec paiement à la livraison.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fffaf3',
    theme_color: '#fffaf3',
    lang: 'fr',
    categories: ['shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Panier', url: '/cart', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      {
        name: 'Mes commandes',
        url: '/orders',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
