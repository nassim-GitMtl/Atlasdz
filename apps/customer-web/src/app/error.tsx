'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { copy, localizedHref, resolveLocale } from '@/lib/i18n';

export default function CatalogError({ reset }: { readonly reset: () => void }) {
  const locale = resolveLocale(useSearchParams().get('lang') ?? undefined);
  const t = copy[locale];
  return (
    <main
      className="state-panel state-panel--page"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      role="alert"
    >
      <p className="eyebrow">atlas dz</p>
      <h1>{t.errorTitle}</h1>
      <p>{t.errorBody}</p>
      <button type="button" className="button button--primary" onClick={reset}>
        {t.retry}
      </button>
      <Link href={localizedHref('/', locale)}>{t.backHome}</Link>
    </main>
  );
}
