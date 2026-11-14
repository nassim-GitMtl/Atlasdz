import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function ForgotPassword({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const locale = localeFrom((await searchParams).lang);
  const t = authCopy[locale];
  return (
    <Shell locale={locale} currentPath="/forgot-password">
      <section className="login-panel">
        <h1>{t.forgotTitle}</h1>
        <p>{t.forgotBody}</p>
        <ForgotPasswordForm locale={locale} />
        <p>
          <Link href={href('/login', locale)}>{t.signIn}</Link>
        </p>
      </section>
    </Shell>
  );
}
