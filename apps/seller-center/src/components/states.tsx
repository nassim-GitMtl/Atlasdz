import Link from 'next/link';
import { copy, href, type Locale } from '@/lib/i18n';
import { SellerApiError } from '@/lib/api';

export function ServiceState({
  error,
  locale,
  retryPath,
}: {
  readonly error: unknown;
  readonly locale: Locale;
  readonly retryPath: string;
}) {
  const t = copy[locale];
  const access =
    error instanceof SellerApiError && ['unauthorized', 'forbidden'].includes(error.code);
  return (
    <section className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {access ? '⌁' : '↻'}
      </span>
      <h1>{access ? t.accessTitle : t.errorTitle}</h1>
      <p>{access ? t.accessBody : t.unavailable}</p>
      <Link className="button" href={href(access ? '/' : retryPath, locale)}>
        {access ? t.reconnect : t.retry}
      </Link>
    </section>
  );
}
