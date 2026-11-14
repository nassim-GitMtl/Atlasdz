import {
  GlobeHemisphereWest,
  MagnifyingGlass,
  Package,
  Storefront,
  Truck,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
            <Link href={localizedHref('/support', locale)}>
              {locale === 'ar' ? 'المساعدة والإرجاع' : 'Aide et retours'}
            </Link>
            <Link href={localizedHref('/orders', locale)}>{orderCopy[locale].title}</Link>
            <Link href={localizedHref('/cart', locale)}>{cartCopy[locale].title}</Link>
            <Link href={localizedHref('/account', locale)}>{authCopy[locale].title}</Link>
            <Link href={localizedHref('/notifications', locale)}>
              {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            </Link>
            <Link href={localizedHref('/search', locale)}>
              <Package aria-hidden="true" size={21} />
              <span>{t.catalog}</span>
            </Link>
            <Link
              className="language-link"
              href={languageSwitchHref(pathname, oppositeLocale, searchParams)}
              hrefLang={oppositeLocale}
            >
              <GlobeHemisphereWest aria-hidden="true" size={20} />
              <span>{t.language}</span>
            </Link>
          </nav>
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
