import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChangePasswordForm, DeleteAccountForm, PhoneForm } from '@/components/account-forms';
import { CustomerSessionForm } from '@/components/cart-forms';
import { SiteChrome } from '@/components/site-chrome';
import { getAccount, getPhone } from '@/lib/account-api';
import { accountCopy } from '@/lib/account-copy';
import { customerToken } from '@/lib/cart-api';
import { lang, localizedHref, type SearchParams, resolveLocale, text } from '@/lib/i18n';
import { listStockAlerts } from '@/lib/stock-alerts-api';

export const metadata: Metadata = { robots: { index: false } };

export default async function Account({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const t = accountCopy[locale];
  const token = await customerToken();
  if (!token) redirect(localizedHref('/login', locale));
  const data = await Promise.all([getAccount(token), getPhone(token)]).catch(() => null);
  if (data === null) redirect(localizedHref('/login', locale));
  const [account, phone] = data;
  // Products the customer waits for (optional: an outage hides the list, not the page).
  const alerts = await listStockAlerts(token).catch(() => []);
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
          <div className="cart-empty">
            <h2>{t.passwordTitle}</h2>
            <p>{t.passwordBody}</p>
            <ChangePasswordForm locale={locale} />
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
          {alerts.length > 0 && (
            <div className="cart-empty">
              <h2>{lang(locale, 'Alertes de retour en stock', 'تنبيهات العودة إلى المخزون', 'Back-in-stock alerts')}</h2>
              <ul className="stock-alert-list">
                {alerts.map((alert) => (
                  <li key={alert.slug}>
                    <Link href={localizedHref(`/product/${alert.slug}`, locale)}>
                      {text(alert.title, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
              <p>
                {lang(
                  locale,
                  'Un e-mail par produit, dès son retour. Annulez depuis la page du produit.',
                  'رسالة واحدة لكل منتج فور عودته. يمكنك الإلغاء من صفحة المنتج.',
                  'One email per product, as soon as it is back. Cancel from the product page.',
                )}
              </p>
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
