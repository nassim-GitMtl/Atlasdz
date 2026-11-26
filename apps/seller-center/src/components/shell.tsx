import {
  Bell,
  ChatCircleText,
  ClockCounterClockwise,
  Flag,
  Gauge,
  IdentificationCard,
  Lifebuoy,
  Package,
  PlusSquare,
  Receipt,
  ShieldCheck,
  Star,
  SquaresFour,
  Storefront,
  Tag,
  Truck,
  UserCircle,
  Users,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { copy, href, lang, languageNames, locales, type Locale } from '@/lib/i18n';
import { DocumentLocale } from './document-locale';
import { orderCopy } from '@/lib/orders-copy';
import { deliveryCopy } from '@/lib/delivery-copy';
import { productsCopy } from '@/lib/products-copy';
import { supportCopy } from '@/lib/support-copy';
import { LogoutForm } from './logout-form';
import { InstallApp } from './pwa';
import { authCopy } from '@/lib/auth-copy';
import { adminCopy } from '@/lib/admin-copy';
import { accountKind } from '@/lib/session';

const groups = {
  fr: { shop: 'Ma boutique', staff: 'Équipe Atlas DZ', dashboard: 'Tableau de bord', notifications: 'Notifications', offers: 'Offres à valider', account: 'Mon compte', escalations: 'Demandes escaladées', vendors: 'Comptes vendeurs', customers: 'Comptes clients', reviews: 'Avis clients' , audit: 'Journal d’audit', questions: 'Questions clients', reports: 'Produits signalés' },
  en: { shop: 'My shop', staff: 'Atlas DZ team', dashboard: 'Dashboard', notifications: 'Notifications', offers: 'Offers to approve', account: 'My account', escalations: 'Escalated requests', vendors: 'Seller accounts', customers: 'Customer accounts', reviews: 'Customer reviews' , audit: 'Audit log', questions: 'Customer questions', reports: 'Reported products' },
  ar: { shop: 'متجري', staff: 'فريق Atlas DZ', dashboard: 'لوحة التحكم', notifications: 'الإشعارات', offers: 'عروض للمراجعة', account: 'حسابي', escalations: 'طلبات مُصعَّدة', vendors: 'حسابات البائعين', customers: 'حسابات الزبائن', reviews: 'تقييمات الزبائن' , audit: 'سجل التدقيق', questions: 'أسئلة الزبائن', reports: 'منتجات مُبلَّغ عنها' },
} as const;

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly Icon: Icon;
  readonly prefix?: boolean;
}

function NavGroup({
  title,
  items,
  currentPath,
  locale,
}: {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly currentPath: string;
  readonly locale: Locale;
}) {
  return (
    <div className="nav-group">
      <span className="nav-group__title">{title}</span>
      {items.map(({ path, label, Icon, prefix }) => {
        const active = prefix ? currentPath.startsWith(path) : currentPath === path;
        return (
          <Link
            key={path}
            className={active ? 'nav-link active' : 'nav-link'}
            href={href(path, locale)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" size={20} weight={active ? 'fill' : 'regular'} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export async function Shell({
  locale,
  currentPath,
  signedIn = false,
  local = false,
  children,
}: {
  readonly locale: Locale;
  readonly currentPath: string;
  readonly signedIn?: boolean;
  readonly local?: boolean;
  readonly children: ReactNode;
}) {
  const t = copy[locale];
  const g = groups[locale];
  // Older sessions have no hint: show both menus; the API still decides what each can do.
  const kind = signedIn ? await accountKind() : undefined;
  const shop: NavItem[] = [
    { path: '/', label: g.dashboard, Icon: SquaresFour },
    { path: '/orders', label: orderCopy[locale].title, Icon: Receipt, prefix: true },
    { path: '/offers', label: t.offers, Icon: Tag, prefix: true },
    { path: '/products', label: productsCopy[locale].newProduct, Icon: PlusSquare, prefix: true },
    { path: '/delivery', label: deliveryCopy[locale].title, Icon: Truck },
    { path: '/reviews', label: g.reviews, Icon: Star },
    { path: '/questions', label: g.questions, Icon: ChatCircleText },
    { path: '/support', label: supportCopy[locale].title, Icon: Lifebuoy },
  ];
  const staff: NavItem[] = [
    { path: '/moderation', label: g.offers, Icon: ShieldCheck },
    { path: '/moderation/products', label: productsCopy[locale].review, Icon: Package },
    { path: '/moderation/sellers', label: authCopy[locale].sellerRequests, Icon: Storefront },
    { path: '/admin/sellers', label: g.vendors, Icon: IdentificationCard, prefix: true },
    { path: '/admin/customers', label: g.customers, Icon: Users },
    { path: '/admin/audit', label: g.audit, Icon: ClockCounterClockwise },
    { path: '/admin/questions', label: g.questions, Icon: ChatCircleText },
    { path: '/admin/reports', label: g.reports, Icon: Flag },
    { path: '/admin', label: adminCopy[locale].nav, Icon: Gauge },
  ];
  // Sellers already reach support from their own menu.
  if (kind === 'staff') staff.splice(3, 0, { path: '/support', label: g.escalations, Icon: Lifebuoy });
  const common: NavItem[] = [
    { path: '/notifications', label: g.notifications, Icon: Bell },
    { path: '/account', label: kind === 'staff' ? g.account : authCopy[locale].accountTitle, Icon: UserCircle },
  ];
  const isStaff = kind === 'staff';
  return (
    <div className={isStaff ? 'workspace workspace--staff' : 'workspace'}>
      <DocumentLocale locale={locale} />
      <a className="skip-link" href="#content">
        {t.skip}
      </a>
      <aside className="sidebar">
        <Link className="wordmark" href={href('/', locale)} aria-label="atlas dz">
          <Image src="/icons/atlas-mark.png" alt="" width={32} height={28} />
          <span dir="ltr">atlas dz</span>
          <small>{isStaff ? g.staff : t.workspace}</small>
        </Link>
        {signedIn && (
          <nav aria-label={t.workspace}>
            {kind !== 'staff' && (
              <NavGroup title={g.shop} items={shop} currentPath={currentPath} locale={locale} />
            )}
            {kind !== 'seller' && (
              <NavGroup title={g.staff} items={staff} currentPath={currentPath} locale={locale} />
            )}
            <NavGroup title="" items={common} currentPath={currentPath} locale={locale} />
          </nav>
        )}
        {!isStaff && (
          <div className="seller-note">
            <strong>{t.responsibility}</strong>
            <p>{t.responsibilityBody}</p>
          </div>
        )}
        <InstallApp locale={locale} />
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="section-label">{isStaff ? g.staff : t.workspace}</span>
          <div className="top-actions">
            <details className="language-menu">
              <summary aria-label={lang(locale, 'Langue', 'اللغة', 'Language')}>
                <span lang={locale}>{languageNames[locale]}</span>
              </summary>
              <ul>
                {locales.map((option) => (
                  <li key={option}>
                    <Link
                      href={href(currentPath, option)}
                      hrefLang={option}
                      lang={option}
                      aria-current={option === locale ? 'true' : undefined}
                    >
                      {languageNames[option]}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            {signedIn && <LogoutForm locale={locale} />}
          </div>
        </header>
        {local && (
          <div className="local-banner">
            <span className="status-dot" />
            {t.localBadge}
          </div>
        )}
        <main id="content">{children}</main>
      </div>
    </div>
  );
}
