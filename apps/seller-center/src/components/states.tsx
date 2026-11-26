import Link from 'next/link';
import { copy, href, type Locale } from '@/lib/i18n';
import { SellerApiError } from '@/lib/api';
import { AdminApiError } from '@/lib/admin';
import { AuthApiError } from '@/lib/auth';

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
  // Both API clients report a refused session or missing permission the same way.
  const access =
    (error instanceof SellerApiError ||
      error instanceof AdminApiError ||
      error instanceof AuthApiError) &&
    ['unauthorized', 'forbidden'].includes(error.code);
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
