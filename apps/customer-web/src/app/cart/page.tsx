import { ProductPhoto } from '@/components/product-photo';
import Link from 'next/link';
import { headers } from 'next/headers';
import { OrderForm } from '@/components/order-forms';
import { OrderError } from '@/components/order-summary';
import { listDestinations } from '@/lib/orders-api';
import { customerCheckoutEnabled } from '@/lib/customer-security';
import { liveCheckoutEnabled, orderText } from '@/lib/orders-copy';
import { SiteChrome } from '@/components/site-chrome';
import { CartQuantityForm, CustomerSessionForm } from '@/components/cart-forms';
import { CartApiError, customerToken, getCart } from '@/lib/cart-api';
import { cartCopy } from '@/lib/cart-copy';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams } from '@/lib/i18n';

export default async function CartPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = params.lang === 'ar' ? 'ar' : 'fr';
  const t = cartCopy[locale];
  const token = await customerToken();
  const checkout = customerCheckoutEnabled(process.env, (await headers()).get('host'));
  const result = token
    ? await getCart(token)
        .then((cart) => ({ cart, error: undefined }))
        .catch((error: unknown) => ({ cart: undefined, error }))
    : { cart: undefined, error: new CartApiError('auth') };
  const destinations =
    checkout && token && result.cart?.items.length
      ? await listDestinations(token)
          .then((data) => ({ items: data.items, error: undefined }))
          .catch((error: unknown) => ({ items: undefined, error }))
      : { items: [], error: undefined };
  return (
    <SiteChrome locale={locale} pathname="/cart" searchParams={params}>
      <section className="page-container cart-page">
        <div className="cart-heading">
          <h1>{t.title}</h1>
          {token && <CustomerSessionForm locale={locale} logout />}
        </div>
        {result.cart ? (
          <>
            <p className="cart-notice">{t.note}</p>
            {result.cart.items.length === 0 ? (
              <div className="cart-empty">
                <h2>{t.empty}</h2>
                <Link className="button button--primary" href={localizedHref('/search', locale)}>
                  {t.browse}
                </Link>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-lines">
                  {result.cart.items.map((line) => (
                    <article className="cart-line" key={line.offerId}>
                      {line.product && (
                        <ProductPhoto src={line.product.imageUrl} alt="" width={100} height={100} />
                      )}
                      <div className="cart-line-body">
                        <h2>
                          {line.product ? (
                            <Link href={localizedHref(`/product/${line.product.slug}`, locale)}>
                              {line.product.title[locale]}
                            </Link>
                          ) : (
                            t.unavailableLine
                          )}
                        </h2>
                        {line.offer && (
                          <>
                            <Link href={localizedHref(`/store/${line.offer.seller.slug}`, locale)}>
                              {line.offer.seller.name}
                            </Link>
                            <p>
                              {t.price}: <bdi>{formatMoney(line.offer.priceMinor, locale)}</bdi>
                            </p>
                          </>
                        )}
                        {line.state !== 'AVAILABLE' && (
                          <p className="cart-feedback" role="status">
                            {line.state === 'UNAVAILABLE' ? t.unavailableLine : t.insufficient}
                          </p>
                        )}
                        <CartQuantityForm
                          key={`${line.offerId}:${result.cart.version}`}
                          line={line}
                          version={result.cart.version}
                          locale={locale}
                        />
                      </div>
                    </article>
                  ))}
                </div>
                <aside className="cart-summary">
                  <h2>{t.subtotal}</h2>
                  <strong>
                    <bdi>{formatMoney(result.cart.availableSubtotalMinor, locale)}</bdi>
                  </strong>
                  <p>{t.shipping}</p>
                  <p className="cart-notice">
                    {checkout ? orderText(locale, liveCheckoutEnabled()).notice : t.boundary}
                  </p>
                  {checkout &&
                    result.cart.items.every((line) => line.state === 'AVAILABLE') &&
                    (destinations.items ? (
                      <OrderForm
                        live={liveCheckoutEnabled()}
                        kind="quote"
                        version={result.cart.version}
                        locale={locale}
                        destinations={destinations.items}
                      />
                    ) : (
                      <OrderError error={destinations.error} locale={locale} path="/cart" />
                    ))}
                </aside>
              </div>
            )}
          </>
        ) : (
          <div className="cart-empty" role="status">
            <p>
              {result.error instanceof CartApiError && result.error.code === 'auth'
                ? t.auth
                : t.unavailable}
            </p>
            {result.error instanceof CartApiError && result.error.code === 'auth' ? (
              <Link className="button button--primary" href={localizedHref('/login', locale)}>
                {t.login}
              </Link>
            ) : (
              <a className="button button--secondary" href={localizedHref('/cart', locale)}>
                {t.retry}
              </a>
            )}
          </div>
        )}
      </section>
    </SiteChrome>
  );
}
