import type { Metadata } from 'next';
import Link from 'next/link';
import { SellerRegisterForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { copy, href, localeFrom, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function Register({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const locale = localeFrom((await searchParams).lang);
  const t = authCopy[locale];
  return (
    <Shell locale={locale} currentPath="/register">
      <section className="login-panel">
        <span className="eyebrow">ATLAS DZ · {copy[locale].workspace}</span>
        <h1>{t.registerTitle}</h1>
        <p>{t.registerBody}</p>
        <SellerRegisterForm locale={locale} />
        <p>
          <Link href={href('/login', locale)}>{t.signIn}</Link>
        </p>
      </section>
    </Shell>
  );
}
