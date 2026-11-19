'use client';
import type { CatalogProduct } from '@atlas/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FAVORITES_KEY, RECENT_KEY, readList } from '@/lib/device-lists';
import { lang, localizedHref, type Locale } from '@/lib/i18n';
import { ProductGrid } from './product-card';

async function load(slugs: readonly string[]): Promise<CatalogProduct[]> {
  if (slugs.length === 0) return [];
  const response = await fetch(`/favorites/products?slugs=${slugs.map(encodeURIComponent).join(',')}`);
  if (!response.ok) throw new Error('unavailable');
  const items = ((await response.json()) as { items: CatalogProduct[] }).items;
  // Keep the saved order (most recent first).
  return slugs.flatMap((slug) => items.filter((item) => item.slug === slug));
}

/** Favorites and recently viewed products saved on this device. */
export function FavoritesView({ locale }: { readonly locale: Locale }) {
  const [state, setState] = useState<{
    favorites?: CatalogProduct[];
    recent?: CatalogProduct[];
    error?: boolean;
  }>({});
  useEffect(() => {
    const refresh = () => {
      const favorites = readList(FAVORITES_KEY, 60);
      const recent = readList(RECENT_KEY, 20).filter((slug) => !favorites.includes(slug));
      Promise.all([load(favorites), load(recent)])
        .then(([favoriteItems, recentItems]) => setState({ favorites: favoriteItems, recent: recentItems }))
        .catch(() => setState({ error: true }));
    };
    refresh();
    window.addEventListener('atlas-favorites', refresh);
    return () => window.removeEventListener('atlas-favorites', refresh);
  }, []);
  if (state.error)
    return (
      <p className="notice error" role="alert">
        {lang(locale, 'La liste n’a pas pu être chargée. Réessayez.', 'تعذر تحميل القائمة. حاول مجددًا.', 'The list could not be loaded. Try again.')}
      </p>
    );
  if (!state.favorites) return <p role="status">{lang(locale, 'Chargement…', 'جارٍ التحميل…', 'Loading…')}</p>;
  return (
    <>
      <section aria-labelledby="favorites-title">
        <h2 id="favorites-title">{lang(locale, 'Vos favoris', 'مفضلتك', 'Your favourites')}</h2>
        {state.favorites.length > 0 ? (
          <ProductGrid products={state.favorites} locale={locale} />
        ) : (
          <p>
            {lang(
              locale,
              'Touchez le cœur d’un produit pour le retrouver ici.',
              'المس القلب على أي منتج لتجده هنا.',
              'Tap the heart on a product to find it here.',
            )}{' '}
            <Link href={localizedHref('/search', locale)}>
              {lang(locale, 'Parcourir le catalogue', 'تصفح الكتالوج', 'Browse the catalogue')}
            </Link>
          </p>
        )}
      </section>
      {state.recent && state.recent.length > 0 && (
        <section aria-labelledby="recent-title">
          <h2 id="recent-title">{lang(locale, 'Vus récemment', 'شوهدت مؤخرًا', 'Recently viewed')}</h2>
          <ProductGrid products={state.recent} locale={locale} />
        </section>
      )}
    </>
  );
}
