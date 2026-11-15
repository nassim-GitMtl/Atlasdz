import {
  Bell,
  GlobeHemisphereWest,
  Lifebuoy,
  MagnifyingGlass,
  Money,
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
  text,
  type Locale,
  type SearchParams,
} from '@/lib/i18n';

import { DocumentLocale } from './document-locale';
import { InstallApp } from './pwa';
import { LEGAL_PAGES, legalTitles } from '@/lib/legal-content';
import { getCart, customerToken } from '@/lib/cart-api';
import { getCategories } from '@/lib/catalog-api';
import { readGuestCart } from '@/lib/guest-cart';

const navCopy = {
  fr: {
    account: 'Mon compte',
    cart: 'Panier',
    orders: 'Commandes',
    notifications: 'Notifications',
    help: 'Aide et retours',
    all: 'Tout le catalogue',
    actions: 'Compte et panier',
    services: 'Suivi et aide',
    facts: ['Plusieurs vendeurs', 'Expédié par chaque vendeur', 'Paiement à la livraison'],
    legal: 'Informations légales',
  },
  ar: {
    account: 'حسابي',
    cart: 'السلة',
    orders: 'طلباتي',
    notifications: 'الإشعارات',
    help: 'المساعدة والإرجاع',
    all: 'كل الكتالوج',
    actions: 'الحساب والسلة',
    services: 'المتابعة والمساعدة',
    facts: ['عدة بائعين', 'يشحنه كل بائع', 'الدفع عند الاستلام'],
    legal: 'معلومات قانونية',
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

/** Real catalogue categories; streams in so the header never waits on them. */
async function CategoryLinks({ locale, pathname }: { readonly locale: Locale; readonly pathname: string }) {
  const categories = await getCategories().catch(() => []);
  return categories.map((category) => {
    const href = `/category/${category.slug}`;
    return (
      <Link
        key={category.slug}
        href={localizedHref(href, locale)}
        aria-current={pathname === href ? 'page' : undefined}
      >
        {text(category.title, locale)}
      </Link>
    );
  });
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
  const current = (path: string) => (pathname === path ? 'page' : undefined);

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
            <MagnifyingGlass aria-hidden="true" size={20} weight="bold" />
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
            <button type="submit">{t.searchAction}</button>
          </form>
          <nav className="header-actions" aria-label={nav.actions}>
            <Link
              className="language-link"
              href={languageSwitchHref(pathname, oppositeLocale, searchParams)}
              hrefLang={oppositeLocale}
              lang={oppositeLocale}
            >
              <GlobeHemisphereWest aria-hidden="true" size={20} />
              <span>{t.language}</span>
            </Link>
            <Link href={localizedHref('/account', locale)} aria-current={current('/account')}>
              <UserCircle aria-hidden="true" size={22} />
              <span className="action-label">{nav.account}</span>
            </Link>
            <Link className="nav-cart" href={localizedHref('/cart', locale)} aria-current={current('/cart')}>
              <ShoppingCart aria-hidden="true" size={22} />
              <span className="action-label">{nav.cart}</span>
              <Suspense fallback={null}>
                <CartBadge locale={locale} />
              </Suspense>
            </Link>
          </nav>
        </div>
        <div className="header-sub">
          <nav className="category-nav" aria-label={t.categoryTitle}>
            <Link href={localizedHref('/search', locale)} aria-current={current('/search')}>
              {nav.all}
            </Link>
            <Suspense fallback={null}>
              <CategoryLinks locale={locale} pathname={pathname} />
            </Suspense>
          </nav>
          <nav className="service-nav" aria-label={nav.services}>
            <Link href={localizedHref('/orders', locale)} aria-current={current('/orders')}>
              <Receipt aria-hidden="true" size={18} />
              {nav.orders}
            </Link>
            <Link href={localizedHref('/notifications', locale)} aria-current={current('/notifications')}>
              <Bell aria-hidden="true" size={18} />
              {nav.notifications}
            </Link>
            <Link href={localizedHref('/support', locale)} aria-current={current('/support')}>
              <Lifebuoy aria-hidden="true" size={18} />
              {nav.help}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <ul className="footer-facts">
          <li>
            <Storefront aria-hidden="true" size={20} /> {nav.facts[0]}
          </li>
          <li>
            <Truck aria-hidden="true" size={20} /> {nav.facts[1]}
          </li>
          <li>
            <Money aria-hidden="true" size={20} /> {nav.facts[2]}
          </li>
        </ul>
        <div className="footer-main">
          <div>
            <Link className="footer-brand" href={localizedHref('/', locale)}>
              atlas dz
            </Link>
            <p>{t.footerScope}</p>
            <InstallApp locale={locale} />
          </div>
          <nav className="footer-links" aria-label={nav.services}>
            <Link href={localizedHref('/search', locale)}>{nav.all}</Link>
            <Link href={localizedHref('/orders', locale)}>{nav.orders}</Link>
            <Link href={localizedHref('/support', locale)}>{nav.help}</Link>
          </nav>
          <nav className="footer-links" aria-label={nav.legal}>
            {LEGAL_PAGES.map((page) => (
              <Link key={page} href={localizedHref(`/legal/${page}`, locale)}>
                {legalTitles[locale][page]}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
