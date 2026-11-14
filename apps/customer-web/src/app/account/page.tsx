import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteAccountForm, PhoneForm } from '@/components/account-forms';
import { CustomerSessionForm } from '@/components/cart-forms';
import { SiteChrome } from '@/components/site-chrome';
import { getAccount, getPhone } from '@/lib/account-api';
import { accountCopy } from '@/lib/account-copy';
import { customerToken } from '@/lib/cart-api';
import { localizedHref, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function Account({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = accountCopy[locale];
  const token = await customerToken();
  if (!token) redirect(localizedHref('/login', locale));
  const data = await Promise.all([getAccount(token), getPhone(token)]).catch(() => null);
  if (data === null) redirect(localizedHref('/login', locale));
  const [account, phone] = data;
  return (
    <SiteChrome locale={locale} pathname="/account" searchParams={params}>
      <section className="page-container auth-page">
        <h1>{t.title}</h1>
        <div className="auth-grid">
          <div className="cart-empty">
            <h2>{t.email}</h2>
            <p dir="ltr">{account.email}</p>
            <p>{account.emailVerified ? t.verified : t.unverified}</p>
            {!account.emailVerified && (
              <Link href={localizedHref('/verify-email', locale)}>{t.resend}</Link>
            )}
            <p>
              <Link href={localizedHref('/orders', locale)}>{t.orders}</Link>
            </p>
            <CustomerSessionForm locale={locale} logout />
          </div>
          {phone.required && (
            <div className="cart-empty">
              <h2>{t.phoneTitle}</h2>
              <p>{t.phoneBody}</p>
              {phone.verified ? (
                <p>
                  {t.phoneVerified} <span dir="ltr">{phone.phone}</span>
                </p>
              ) : (
                <PhoneForm locale={locale} />
              )}
            </div>
          )}
          <div className="cart-empty">
            <h2>{t.privacyTitle}</h2>
            <p>{t.privacyBody}</p>
            <a className="button button--secondary" href="/account/export" download>
              {t.download}
            </a>
            <h3>{t.deleteTitle}</h3>
            <p>{t.deleteBody}</p>
            <DeleteAccountForm locale={locale} />
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
