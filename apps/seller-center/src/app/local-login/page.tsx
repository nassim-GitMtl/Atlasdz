import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { LocalLoginForm } from '@/components/forms';
import { Shell } from '@/components/shell';
import { copy, localeFrom, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';

export default async function LocalLogin({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  if (!localAccountsEnabled(process.env, (await headers()).get('host'))) notFound();
  const locale = localeFrom((await searchParams).lang);
  const t = copy[locale];
  return (
    <Shell locale={locale} currentPath="/local-login" local>
      <section className="login-panel">
        <span className="eyebrow">{t.localBadge}</span>
        <h1>{t.localTitle}</h1>
        <p>{t.localBody}</p>
        <div className="login-actions">
          <LocalLoginForm locale={locale} account="seller" />
          <LocalLoginForm locale={locale} account="admin" />
        </div>
      </section>
    </Shell>
  );
}
