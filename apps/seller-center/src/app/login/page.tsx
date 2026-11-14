import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { SellerLoginForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { copy, href, localeFrom, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';

export const metadata: Metadata = { robots: { index: false } };

export default async function Login({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = authCopy[locale];
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  return (
    <Shell locale={locale} currentPath="/login" local={local}>
      <section className="login-panel">
        <span className="eyebrow">ATLAS DZ · {copy[locale].workspace}</span>
        <h1>{t.signIn}</h1>
        <p>{t.signInBody}</p>
        {params.registered === '1' && (
          <p role="status" className="notice success">
            {t.registered}
          </p>
        )}
        <SellerLoginForm locale={locale} />
        <p>
          <Link href={href('/register', locale)}>{t.becomeSeller}</Link>
          {' · '}
          <Link href={href('/forgot-password', locale)}>{t.forgot}</Link>
          {local && (
            <>
              {' · '}
              <Link href={href('/local-login', locale)}>{copy[locale].localLink}</Link>
            </>
          )}
        </p>
      </section>
    </Shell>
  );
}
