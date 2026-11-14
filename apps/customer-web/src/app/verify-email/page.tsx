import type { Metadata } from 'next';
import Link from 'next/link';
import { ResendVerificationForm } from '@/components/auth-forms';
import { SiteChrome } from '@/components/site-chrome';
import { verifyEmail } from '@/lib/auth-client';
import { authCopy } from '@/lib/auth-copy';
import { localizedHref, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' };

export default async function VerifyEmail({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = authCopy[locale];
  const token = typeof params.token === 'string' ? params.token : '';
  // Tokens are single-use; verification happens server-side on first render of the link.
  const verified = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await verifyEmail(token).catch(() => null)
    : undefined;
  return (
    <SiteChrome locale={locale} pathname="/verify-email" searchParams={{ lang: locale }}>
      <section className="page-container auth-page">
        <div className="cart-empty">
          <h1>{t.verifyTitle}</h1>
          {verified === true ? (
            <p role="status">
              {t.verifyDone} <Link href={localizedHref('/cart', locale)}>→</Link>
            </p>
          ) : (
            <>
              {verified === false && <p role="alert">{t.verifyInvalid}</p>}
              {verified === null && <p role="alert">{t.unavailable}</p>}
              <ResendVerificationForm locale={locale} />
            </>
          )}
        </div>
      </section>
    </SiteChrome>
  );
}
