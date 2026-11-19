import type { Metadata } from 'next';
import { FavoritesView } from '@/components/favorites-view';
import { SiteChrome } from '@/components/site-chrome';
import { lang, resolveLocale, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function Favorites({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  return (
    <SiteChrome locale={locale} pathname="/favorites" searchParams={params}>
      <div className="page-shell favorites-page">
        <h1>{lang(locale, 'Favoris', 'المفضلة', 'Favourites')}</h1>
        <p className="muted">
          {lang(
            locale,
            'Enregistrés sur cet appareil seulement, sans compte.',
            'محفوظة على هذا الجهاز فقط، دون حساب.',
            'Saved on this device only, no account needed.',
          )}
        </p>
        <FavoritesView locale={locale} />
      </div>
    </SiteChrome>
  );
}
