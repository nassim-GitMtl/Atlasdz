import Link from 'next/link';
import type { ReactNode } from 'react';
import { copy, href, type Locale } from '@/lib/i18n';
import { DocumentLocale } from './document-locale';
import { orderCopy } from '@/lib/orders-copy';
import { deliveryCopy } from '@/lib/delivery-copy';
import { productsCopy } from '@/lib/products-copy';
import { LogoutForm } from './logout-form';
import { InstallApp } from './pwa';
import { authCopy } from '@/lib/auth-copy';
import { adminCopy } from '@/lib/admin-copy';

export function Shell({
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
  return (
    <div className="workspace">
      <DocumentLocale locale={locale} />
      <a className="skip-link" href="#content">
        {t.skip}
      </a>
      <aside className="sidebar">
        <Link className="wordmark" href={href('/', locale)} aria-label="atlas dz">
          <span>
            atlas<span className="brand-dot">.</span>dz
          </span>
          <small>{t.workspace}</small>
        </Link>
        {signedIn && (
          <nav aria-label={t.workspace}>
            <Link
              className={currentPath === '/products' ? 'nav-link active' : 'nav-link'}
              href={href('/products', locale)}
              aria-current={currentPath === '/products' ? 'page' : undefined}
            >
              {productsCopy[locale].newProduct}
            </Link>
            <Link
              className={currentPath === '/moderation/products' ? 'nav-link active' : 'nav-link'}
              href={href('/moderation/products', locale)}
              aria-current={currentPath === '/moderation/products' ? 'page' : undefined}
            >
              {productsCopy[locale].review}
            </Link>
            <Link
              className={currentPath === '/moderation/sellers' ? 'nav-link active' : 'nav-link'}
              href={href('/moderation/sellers', locale)}
              aria-current={currentPath === '/moderation/sellers' ? 'page' : undefined}
            >
              {authCopy[locale].sellerRequests}
            </Link>
            <Link
              className={currentPath === '/admin' ? 'nav-link active' : 'nav-link'}
              href={href('/admin', locale)}
              aria-current={currentPath === '/admin' ? 'page' : undefined}
            >
              {adminCopy[locale].nav}
            </Link>
            <Link
              className={currentPath === '/account' ? 'nav-link active' : 'nav-link'}
              href={href('/account', locale)}
              aria-current={currentPath === '/account' ? 'page' : undefined}
            >
              {authCopy[locale].accountTitle}
            </Link>
            <Link
              className={currentPath === '/support' ? 'nav-link active' : 'nav-link'}
              href={href('/support', locale)}
            >
              {locale === 'ar' ? 'المساعدة والإرجاع' : 'Aide et retours'}
            </Link>
            <Link
              className={currentPath === '/notifications' ? 'nav-link active' : 'nav-link'}
              href={href('/notifications', locale)}
              aria-current={currentPath === '/notifications' ? 'page' : undefined}
            >
              <span aria-hidden="true">◉</span>
              {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            </Link>
            <Link
              className={currentPath.startsWith('/orders') ? 'nav-link active' : 'nav-link'}
              href={href('/orders', locale)}
              aria-current={currentPath.startsWith('/orders') ? 'page' : undefined}
            >
              <span aria-hidden="true">↗</span>
              {orderCopy[locale].title}
            </Link>
            <Link
              className={currentPath.startsWith('/offers') ? 'nav-link active' : 'nav-link'}
              href={href('/offers', locale)}
              aria-current={currentPath.startsWith('/offers') ? 'page' : undefined}
            >
              <span aria-hidden="true">▦</span>
              {t.offers}
            </Link>
            <Link
              className={currentPath === '/moderation' ? 'nav-link active' : 'nav-link'}
              href={href('/moderation', locale)}
              aria-current={currentPath === '/moderation' ? 'page' : undefined}
            >
              <span aria-hidden="true">✓</span>
              {t.moderation}
            </Link>
            <Link
              className={currentPath === '/delivery' ? 'nav-link active' : 'nav-link'}
              href={href('/delivery', locale)}
              aria-current={currentPath === '/delivery' ? 'page' : undefined}
            >
              <span aria-hidden="true">↗</span>
              {deliveryCopy[locale].title}
            </Link>
          </nav>
        )}
        <div className="seller-note">
          <span className="note-emblem" aria-hidden="true">
            ↗
          </span>
          <strong>{t.responsibility}</strong>
          <p>{t.responsibilityBody}</p>
        </div>
        <InstallApp locale={locale} />
        <div className="sidebar-footer">
          Atlas DZ <span>© {new Date().getFullYear()}</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="section-label">
            {currentPath === '/moderation' ? t.moderation : t.workspace}
          </span>
          <div className="top-actions">
            <Link
              lang={locale === 'fr' ? 'ar' : 'fr'}
              href={href(currentPath, locale === 'fr' ? 'ar' : 'fr')}
            >
              {t.language}
            </Link>
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
