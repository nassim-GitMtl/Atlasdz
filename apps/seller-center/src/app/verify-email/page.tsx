import type { Metadata } from 'next';
import Link from 'next/link';
import { Shell } from '@/components/shell';
import { AuthApiError, verifyEmail } from '@/lib/auth';
import { authCopy } from '@/lib/auth-copy';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' };

export default async function VerifyEmail({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = authCopy[locale];
  const token = typeof params.token === 'string' ? params.token : '';
  const ok = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await verifyEmail(token).then(
        () => true,
        (error: unknown) =>
          error instanceof AuthApiError && error.code !== 'unavailable' ? false : null,
      )
    : false;
  return (
    <Shell locale={locale} currentPath="/verify-email">
      <section className="login-panel">
        <h1>{t.verifyTitle}</h1>
        <p role={ok ? 'status' : 'alert'} className={ok ? 'notice success' : 'notice error'}>
          {ok ? t.verifyDone : ok === null ? t.unavailable : t.verifyInvalid}
        </p>
        <Link href={href('/login', locale)}>{t.signIn}</Link>
      </section>
    </Shell>
  );
}
