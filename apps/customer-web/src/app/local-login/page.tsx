import { headers } from 'next/headers';
import { SiteChrome } from '@/components/site-chrome';
import { CustomerSessionForm } from '@/components/cart-forms';
import { cartCopy } from '@/lib/cart-copy';
import { customerLocalEnabled } from '@/lib/customer-security';
import type { SearchParams } from '@/lib/i18n';
import { resolveLocale } from '@/lib/i18n';

export default async function LocalLogin({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const t = cartCopy[locale];
  const enabled = customerLocalEnabled(process.env, (await headers()).get('host'));
  return (
    <SiteChrome locale={locale} pathname="/local-login" searchParams={params}>
      <section className="page-container cart-page">
        <div className="cart-empty">
          <h1>{t.login}</h1>
          <p>{enabled ? t.loginBody : t.disabled}</p>
          {enabled && <CustomerSessionForm locale={locale} />}
        </div>
      </section>
    </SiteChrome>
  );
}
