import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth-forms';
import { SiteChrome } from '@/components/site-chrome';
import { authCopy } from '@/lib/auth-copy';
import type { SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPassword({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = authCopy[locale];
  const token = typeof params.token === 'string' ? params.token : '';
  return (
    <SiteChrome locale={locale} pathname="/reset-password" searchParams={{ lang: locale }}>
      <section className="page-container auth-page">
        <div className="cart-empty">
          <h1>{t.resetTitle}</h1>
          {/^[A-Za-z0-9_-]{43}$/.test(token) ? (
            <ResetPasswordForm locale={locale} token={token} />
          ) : (
            <p role="alert">{t.resetInvalid}</p>
          )}
        </div>
      </section>
    </SiteChrome>
  );
}
