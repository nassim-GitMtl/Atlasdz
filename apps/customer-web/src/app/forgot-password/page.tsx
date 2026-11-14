import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth-forms';
import { SiteChrome } from '@/components/site-chrome';
import { authCopy } from '@/lib/auth-copy';
import { localizedHref, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function ForgotPassword({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = authCopy[locale];
  return (
    <SiteChrome locale={locale} pathname="/forgot-password" searchParams={params}>
      <section className="page-container auth-page">
        <div className="cart-empty">
          <h1>{t.forgotTitle}</h1>
          <p>{t.forgotBody}</p>
          <ForgotPasswordForm locale={locale} />
          <p>
            <Link href={localizedHref('/login', locale)}>{t.backToLogin}</Link>
          </p>
        </div>
      </section>
    </SiteChrome>
  );
}
