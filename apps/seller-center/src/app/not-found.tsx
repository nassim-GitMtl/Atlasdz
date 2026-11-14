import Link from 'next/link';
import { headers } from 'next/headers';
import { copy, href } from '@/lib/i18n';

export default async function NotFound() {
  const locale = (await headers()).get('x-atlas-locale') === 'ar' ? 'ar' : 'fr';
  return (
    <main className="empty-state">
      <span className="eyebrow">ATLAS DZ · 404</span>
      <h1>{locale === 'ar' ? 'الصفحة غير متاحة.' : 'Cette page n’est pas disponible.'}</h1>
      <Link className="button" href={href('/', locale)}>
        {copy[locale].reconnect}
      </Link>
    </main>
  );
}
