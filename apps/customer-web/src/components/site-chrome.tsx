import {
  Bell,
  GlobeHemisphereWest,
  Lifebuoy,
  MagnifyingGlass,
  Package,
  Receipt,
  ShoppingCart,
  Storefront,
  Truck,
  UserCircle,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import {
  copy,
  languageSwitchHref,
  localizedHref,
  type Locale,
  type SearchParams,
} from '@/lib/i18n';

import { DocumentLocale } from './document-locale';
import { InstallApp } from './pwa';
import { authCopy } from '@/lib/auth-copy';
import { LEGAL_PAGES, legalTitles } from '@/lib/legal-content';
import { cartCopy } from '@/lib/cart-copy';
import { orderCopy } from '@/lib/orders-copy';
import { getCart, customerToken } from '@/lib/cart-api';
import { readGuestCart } from '@/lib/guest-cart';

/** Short labels replace the long ones on phones (one row of icons). */
const navCopy = {
  fr: {
    help: ['Aide et retours', 'Aide'],
    notifications: ['Notifications', 'Alertes'],
    orders: 'Commandes',
    cart: 'Panier',
    account: 'Compte',
  },
  ar: {
    help: ['المساعدة والإرجاع', 'المساعدة'],
    notifications: ['الإشعارات', 'الإشعارات'],
    orders: 'طلباتي',
    cart: 'السلة',
    account: 'حسابي',
  },
} as const;

/** Items in the cart (account cart, or the cookie cart when signed out). */
async function cartCount(): Promise<number> {
  const token = await customerToken();
  const lines = token
    ? await getCart(token)
        .then((cart) => cart.items)
        .catch(() => [])
    : await readGuestCart();
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Streams in after the header, so no page waits for the cart. */
async function CartBadge({ locale }: { readonly locale: Locale }) {
  const items = await cartCount();
  if (items === 0) return null;
  return (
    <span className="cart-count">
      <span aria-hidden="true">{items > 99 ? '99+' : items}</span>
      <span className="sr-only">
        {locale === 'ar' ? `(${items} منتجات)` : `(${items} articles)`}
      </span>
    </span>
  );
}

function NavLabel({ full, short }: { readonly full: string; readonly short: string }) {
  return (
    <span className="nav-label">
      <span className="nav-full">{full}</span>
      <span className="nav-short">{short}</span>
    </span>
  );
}

interface SiteChromeProps {
  readonly children: ReactNode;
  readonly locale: Locale;
  readonly pathname: string;
  readonly searchParams: SearchParams;
  readonly searchValue?: string | undefined;
}

export function SiteChrome({
  children,
  locale,
  pathname,
  searchParams,
  searchValue = '',
}: SiteChromeProps) {
  const t = copy[locale];
  const oppositeLocale: Locale = locale === 'fr' ? 'ar' : 'fr';
  const preview = process.env.SYNTHETIC_CATALOG_PREVIEW !== 'false';
  const nav = navCopy[locale];

  return (
    <div className="site-root" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <DocumentLocale locale={locale} />
      <a className="skip-link" href="#main-content">
        {t.skip}
      </a>
      {preview ? (
        <aside className="preview-ribbon" aria-label={t.preview}>
          <span>{t.preview}</span>
          <small>{t.previewDetail}</small>
        </aside>
      ) : null}
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href={localizedHref('/', locale)} aria-label={t.brandLabel}>
            <Image src="/assets/atlas-loop-mark.png" alt="" width={48} height={42} priority />
            <span>atlas dz</span>
          </Link>
          <form className="header-search" action="/search" role="search">
            <MagnifyingGlass aria-hidden="true" size={21} weight="bold" />
            <label className="sr-only" htmlFor="catalog-search">
              {t.searchLabel}
            </label>
            <input
              id="catalog-search"
              name="query"
              type="search"
              defaultValue={searchValue}
              placeholder={t.searchPlaceholder}
              maxLength={120}
            />
            <input name="lang" type="hidden" value={locale} />
            <button type="submit" aria-label={t.searchAction}>
              <MagnifyingGlass aria-hidden="true" size={23} weight="bold" />
            </button>
          </form>
          <nav className="header-nav" aria-label={t.catalog}>
            <Link href={localizedHref('/search', locale)}>
              <Package aria-hidden="true" size={22} />
              <NavLabel full={t.catalog} short={t.catalog} />
            </Link>
            <Link className="nav-cart" href={localizedHref('/cart', locale)}>
              <ShoppingCart aria-hidden="true" size={22} />
              <NavLabel full={cartCopy[locale].title} short={nav.cart} />
              <Suspense fallback={null}>
                <CartBadge locale={locale} />
              </Suspense>
            </Link>
            <Link href={localizedHref('/orders', locale)}>
              <Receipt aria-hidden="true" size={22} />
              <NavLabel full={orderCopy[locale].title} short={nav.orders} />
            </Link>
            <Link href={localizedHref('/account', locale)}>
              <UserCircle aria-hidden="true" size={22} />
              <NavLabel full={authCopy[locale].title} short={nav.account} />
            </Link>
            <Link href={localizedHref('/notifications', locale)}>
              <Bell aria-hidden="true" size={22} />
              <NavLabel full={nav.notifications[0]} short={nav.notifications[1]} />
            </Link>
            <Link href={localizedHref('/support', locale)}>
              <Lifebuoy aria-hidden="true" size={22} />
              <NavLabel full={nav.help[0]} short={nav.help[1]} />
            </Link>
          </nav>
          <Link
            className="language-link"
            href={languageSwitchHref(pathname, oppositeLocale, searchParams)}
            hrefLang={oppositeLocale}
          >
            <GlobeHemisphereWest aria-hidden="true" size={22} />
            <span>{t.language}</span>
          </Link>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <div>
          <Link className="footer-brand" href={localizedHref('/', locale)}>
            atlas dz
          </Link>
          <p>{t.footerScope}</p>
          <nav
            className="footer-legal"
            aria-label={locale === 'ar' ? 'معلومات قانونية' : 'Informations légales'}
          >
            {LEGAL_PAGES.map((page) => (
              <Link key={page} href={localizedHref(`/legal/${page}`, locale)}>
                {legalTitles[locale][page]}
              </Link>
            ))}
          </nav>
          <InstallApp locale={locale} />
        </div>
        <div className="footer-facts" aria-hidden="true">
          <span>
            <Storefront size={19} /> {locale === 'ar' ? 'متعدد البائعين' : 'Multi-vendeur'}
          </span>
          <span>
            <Truck size={19} /> {locale === 'ar' ? 'توصيل من البائع' : 'Expédié par le vendeur'}
          </span>
        </div>
      </footer>
    </div>
  );
}
