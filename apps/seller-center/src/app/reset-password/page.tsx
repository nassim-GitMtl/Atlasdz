import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { localeFrom, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPassword({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = authCopy[locale];
  const token = typeof params.token === 'string' ? params.token : '';
  return (
    <Shell locale={locale} currentPath="/reset-password">
      <section className="login-panel">
        <h1>{t.resetTitle}</h1>
        {/^[A-Za-z0-9_-]{43}$/.test(token) ? (
          <ResetPasswordForm locale={locale} token={token} />
        ) : (
          <p role="alert" className="notice error">
            {t.resetInvalid}
          </p>
        )}
      </section>
    </Shell>
  );
}
