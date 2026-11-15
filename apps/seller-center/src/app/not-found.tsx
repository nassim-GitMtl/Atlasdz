import Link from 'next/link';
import { headers } from 'next/headers';
import { copy, href, localeFrom, lang } from '@/lib/i18n';

export default async function NotFound() {
  const locale = localeFrom((await headers()).get('x-atlas-locale'));
  return (
    <main className="empty-state">
      <span className="eyebrow">ATLAS DZ · 404</span>
      <h1>{lang(locale, 'Cette page n’est pas disponible.', 'الصفحة غير متاحة.', 'This page is not available.')}</h1>
      <Link className="button" href={href('/', locale)}>
        {copy[locale].reconnect}
      </Link>
    </main>
  );
}
