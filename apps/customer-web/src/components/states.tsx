import {
  ArrowClockwise,
  MagnifyingGlass,
  Package,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { copy, localizedHref, type Locale } from '@/lib/i18n';

export function EmptyState({ locale }: { readonly locale: Locale }) {
  const t = copy[locale];
  return (
    <section className="state-panel">
      <span className="state-icon">
        <MagnifyingGlass aria-hidden="true" size={34} />
      </span>
      <p className="eyebrow">{t.catalog}</p>
      <h2>{t.emptyTitle}</h2>
      <p>{t.emptyBody}</p>
      <Link className="button button--primary" href={localizedHref('/search', locale)}>
        <Package aria-hidden="true" size={19} />
        {t.allOffers}
      </Link>
    </section>
  );
}

export function NotFoundState({ locale }: { readonly locale: Locale }) {
  const t = copy[locale];
  return (
    <section className="state-panel state-panel--page">
      <span className="state-icon state-icon--coral">
        <WarningCircle aria-hidden="true" size={36} />
      </span>
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundBody}</p>
      <Link className="button button--primary" href={localizedHref('/', locale)}>
        {t.backHome}
      </Link>
    </section>
  );
}

export function LoadingState() {
  return (
    <section className="loading-shell" aria-busy="true" aria-label="Chargement · جارٍ التحميل">
      <div className="loading-heading" />
      <div className="loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="loading-card" key={index}>
            <span />
            <i />
            <i />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ErrorState({
  locale,
  retry,
}: {
  readonly locale: Locale;
  readonly retry?: () => void;
}) {
  const t = copy[locale];
  return (
    <section className="state-panel state-panel--page" role="alert">
      <span className="state-icon state-icon--coral">
        <WarningCircle aria-hidden="true" size={36} />
      </span>
      <h1>{t.errorTitle}</h1>
      <p>{t.errorBody}</p>
      {retry ? (
        <button className="button button--primary" type="button" onClick={retry}>
          <ArrowClockwise aria-hidden="true" size={19} />
          {t.retry}
        </button>
      ) : null}
    </section>
  );
}
