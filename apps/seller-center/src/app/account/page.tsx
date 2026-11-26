import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HolidayForm } from '@/components/holiday-form';
import { LegalForm } from '@/components/legal-form';
import { LogoForm } from '@/components/logo-form';
import { PasswordForm } from '@/components/password-form';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { sellerAccount } from '@/lib/auth';
import { authCopy } from '@/lib/auth-copy';
import { href, lang, localeFrom, type SearchParams } from '@/lib/i18n';
import { accessToken, accountKind } from '@/lib/session';

export default async function Account({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const locale = localeFrom((await searchParams).lang);
  const t = authCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  // Staff accounts have no shop: only the password section applies to them.
  if ((await accountKind()) === 'staff')
    return (
      <Shell locale={locale} currentPath="/account" signedIn>
        <section className="login-panel">
          <h1>{lang(locale, 'Mon compte', 'حسابي', 'My account')}</h1>
          <PasswordForm locale={locale} />
        </section>
      </Shell>
    );
  const account = await sellerAccount(token).catch((error: unknown) => ({ error }));
  return (
    <Shell locale={locale} currentPath="/account" signedIn>
      {'error' in account ? (
        <ServiceState error={account.error} locale={locale} retryPath="/account" />
      ) : (
        <section className="login-panel">
          <h1>{t.accountTitle}</h1>
          <p role="status" className={account.status === 'APPROVED' ? 'notice success' : 'notice'}>
            {t[account.status]}
          </p>
          {account.status === 'APPROVED' && (
            <Link className="button" href={href('/offers', locale)}>
              {t.goOffers}
            </Link>
          )}
          {account.role === 'STAFF' && (
            <p className="notice">
              {lang(
                locale,
                'Vous êtes membre de l’équipe : vous traitez les commandes, la livraison et l’aide. Les réglages de la boutique sont réservés au propriétaire.',
                'أنت عضو في الفريق: تعالج الطلبات والتوصيل والمساعدة. إعدادات المتجر خاصة بالمالك.',
                'You are a team member: you handle orders, delivery and help. Shop settings are for the owner.',
              )}
            </p>
          )}
          {account.status === 'APPROVED' && account.role !== 'STAFF' && (
            <HolidayForm locale={locale} holidayUntil={account.holidayUntil} />
          )}
          {account.status === 'APPROVED' && account.role !== 'STAFF' && (
            <LogoForm locale={locale} logoUrl={account.logoUrl} />
          )}
          {account.role !== 'STAFF' && <LegalForm locale={locale} legal={account.legal} />}
          <PasswordForm locale={locale} />
        </section>
      )}
    </Shell>
  );
}
