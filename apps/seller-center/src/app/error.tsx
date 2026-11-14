'use client';

import { useSearchParams } from 'next/navigation';
import { copy } from '@/lib/i18n';

export default function ErrorPage({ reset }: { readonly reset: () => void }) {
  const locale = useSearchParams().get('lang') === 'ar' ? 'ar' : 'fr';
  return (
    <main className="empty-state">
      <h1>{copy[locale].errorTitle}</h1>
      <p>{copy[locale].unavailable}</p>
      <button className="button" onClick={reset}>
        {copy[locale].retry}
      </button>
    </main>
  );
}
