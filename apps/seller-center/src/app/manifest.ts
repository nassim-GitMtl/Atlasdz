import type { MetadataRoute } from 'next';

/**
 * Web app manifest: lets sellers and staff install Seller Center on Android, iPhone and desktop
 * (home-screen icon, full-screen window). public/sw.js adds the offline page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'atlas dz · Espace vendeur',
    short_name: 'atlas vendeur',
    description: 'Gérez vos produits, offres, livraisons et commandes sur atlas dz.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf8f0',
    theme_color: '#faf8f0',
    lang: 'fr',
    categories: ['business', 'shopping'],
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
      {
        name: 'Commandes',
        url: '/orders',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Produits',
        url: '/products',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
