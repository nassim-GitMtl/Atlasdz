import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AuthForm } from '@/components/auth-forms';
import { CustomerSessionForm } from '@/components/cart-forms';
import { SiteChrome } from '@/components/site-chrome';
import { authCopy } from '@/lib/auth-copy';
import { customerLocalEnabled } from '@/lib/customer-security';
import type { SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function Login({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = authCopy[locale];
  const next = typeof params.next === 'string' ? params.next : '/cart';
  const local = customerLocalEnabled(process.env, (await headers()).get('host'));
  return (
    <SiteChrome locale={locale} pathname="/login" searchParams={params}>
      <section className="page-container auth-page">
        <h1>{t.title}</h1>
        <div className="auth-grid">
          <div className="cart-empty">
            <h2>{t.signIn}</h2>
            <p>{t.signInBody}</p>
            <AuthForm mode="login" locale={locale} next={next} />
          </div>
          <div className="cart-empty">
            <h2>{t.register}</h2>
            <p>{t.registerBody}</p>
            <AuthForm mode="register" locale={locale} next={next} />
          </div>
        </div>
        <div className="cart-empty auth-guest">
          <h2>{t.guestTitle}</h2>
          <p>{t.guestBody}</p>
          <AuthForm mode="guest" locale={locale} next={next} />
        </div>
        {local && (
          <div className="cart-empty auth-local">
            <h2>{t.localTitle}</h2>
            <CustomerSessionForm locale={locale} />
          </div>
        )}
      </section>
    </SiteChrome>
  );
}
