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
  lang,
  languageNames,
  locales,
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
    facts: [
      ['Chaque vendeur prépare et livre sa commande.', 'Plusieurs vendeurs dans un panier : une commande et une livraison par vendeur.'],
      ['Frais de livraison fixés par le vendeur.', 'Selon votre commune, affichés au récapitulatif avant de confirmer.'],
      ['Paiement à la livraison.', 'Vous payez le vendeur ou son livreur, pas Atlas DZ.'],
    ],
    legal: 'Informations légales',
  },
  en: {
    account: 'My account',
    cart: 'Cart',
    orders: 'Orders',
    notifications: 'Notifications',
    help: 'Help and returns',
    all: 'All products',
    actions: 'Account and cart',
    services: 'Tracking and help',
    facts: [
      ['Each seller prepares and delivers its order.', 'Several sellers in one cart: one order and one delivery per seller.'],
      ['Delivery fees set by the seller.', 'Based on your commune, shown at review before you confirm.'],
      ['Cash on delivery.', 'You pay the seller or its courier, not Atlas DZ.'],
    ],
    legal: 'Legal information',
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
    facts: [
      ['كل بائع يحضّر ويوصل طلبه.', 'عدة بائعين في سلة واحدة: طلب وتوصيل مستقل لكل بائع.'],
      ['يحدد البائع رسوم التوصيل.', 'حسب بلديتك، وتظهر في الملخص قبل التأكيد.'],
      ['الدفع عند الاستلام.', 'تدفع للبائع أو لمندوبه، وليس لأطلس DZ.'],
    ],
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
        {lang(locale, `(${items} articles)`, `(${items} منتجات)`, `(${items} items)`)}
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
  // The synthetic-catalogue ribbon is for local/test runs only, never a deployed shop.
  const preview =
    process.env.SYNTHETIC_CATALOG_PREVIEW === 'true' ||
    (process.env.SYNTHETIC_CATALOG_PREVIEW !== 'false' &&
      ['local', 'test'].includes(process.env.APP_ENV ?? ''));
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
            <details className="language-menu">
              <summary aria-label={lang(locale, 'Langue', 'اللغة', 'Language')}>
                <GlobeHemisphereWest aria-hidden="true" size={20} />
                <span lang={locale}>{languageNames[locale]}</span>
              </summary>
              <ul>
                {locales.map((option) => (
                  <li key={option}>
                    <Link
                      href={languageSwitchHref(pathname, option, searchParams)}
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
          {nav.facts.map(([title, body], index) => {
            const FactIcon = [Storefront, Truck, Money][index] ?? Storefront;
            return (
              <li key={title}>
                <FactIcon aria-hidden="true" size={22} />
                <span>
                  <strong>{title}</strong> {body}
                </span>
              </li>
            );
          })}
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
