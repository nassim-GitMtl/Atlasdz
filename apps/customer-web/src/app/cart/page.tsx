import { PromoPrice } from '@/components/promo-price';
import { CheckoutSteps } from '@/components/checkout-steps';
import { ProductPhoto } from '@/components/product-photo';
import Link from 'next/link';
import { headers } from 'next/headers';
import { OrderForm } from '@/components/order-forms';
import { OrderError } from '@/components/order-summary';
import { getDestinations } from '@/lib/catalog-api';
import { guestCart, readGuestCart } from '@/lib/guest-cart';
import { preorderCopy, preorderSpan, preorderText } from '@/lib/preorder';
import { customerCheckoutEnabled } from '@/lib/customer-security';
import { liveCheckoutEnabled, orderText } from '@/lib/orders-copy';
import { SiteChrome } from '@/components/site-chrome';
import { CartQuantityForm, CustomerSessionForm } from '@/components/cart-forms';
import { CartApiError, customerToken, getCart } from '@/lib/cart-api';
import { cartCopy } from '@/lib/cart-copy';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams, resolveLocale, contentLocale, lang } from '@/lib/i18n';

type CartLine = NonNullable<Awaited<ReturnType<typeof getCart>>>['items'][number];

/** One block per seller, as each seller ships and is paid separately. */
function sellerGroups(lines: readonly CartLine[]) {
  const groups = new Map<
    string,
    { key: string; seller: NonNullable<CartLine['offer']>['seller'] | undefined; lines: CartLine[]; subtotalMinor: number }
  >();
  for (const line of lines) {
    const seller = line.offer?.seller;
    const key = seller?.id ?? 'unavailable';
    const group = groups.get(key) ?? { key, seller, lines: [], subtotalMinor: 0 };
    group.lines.push(line);
    if (line.offer && line.state === 'AVAILABLE') group.subtotalMinor += line.offer.priceMinor * line.quantity;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export default async function CartPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const t = cartCopy[locale];
  const token = await customerToken();
  const checkout = customerCheckoutEnabled(process.env, (await headers()).get('host'));
  // Signed-out shoppers have a cookie cart; the email is asked at checkout.
  const result = token
    ? await getCart(token)
        .then((cart) => ({ cart, error: undefined }))
        .catch((error: unknown) => ({ cart: undefined, error }))
    : await guestCart(await readGuestCart())
        .then((cart) => ({ cart, error: undefined }))
        .catch((error: unknown) => ({ cart: undefined, error }));
  const destinations =
    checkout && result.cart?.items.length
      ? await getDestinations()
          .then((items) => ({ items, error: undefined }))
          .catch((error: unknown) => ({ items: undefined, error }))
      : { items: [], error: undefined };
  return (
    <SiteChrome locale={locale} pathname="/cart" searchParams={params}>
      <section className="page-container cart-page">
        {Boolean(result.cart?.items.length) && <CheckoutSteps locale={locale} current={0} />}
        <div className="cart-heading">
          <h1>{t.title}</h1>
          {token && <CustomerSessionForm locale={locale} logout />}
        </div>
        {typeof params.reordered === 'string' && /^\d{1,3}$/.test(params.reordered) && (
          <p className="notice success" role="status">
            {lang(
              locale,
              `${params.reordered} article(s) de votre commande remis dans le panier, aux prix et stocks d’aujourd’hui.`,
              `أُعيد ${params.reordered} منتج من طلبك إلى السلة بأسعار ومخزون اليوم.`,
              `${params.reordered} item(s) from your order put back in the cart, at today's prices and stock.`,
            )}
          </p>
        )}
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
                  {sellerGroups(result.cart.items).map((group) => (
                    <section className="seller-cart-group" key={group.key}>
                      <h2>
                        {group.seller ? (
                          <>
                            {t.soldBy}{' '}
                            <Link href={localizedHref(`/store/${group.seller.slug}`, locale)}>
                              {group.seller.name}
                            </Link>
                          </>
                        ) : (
                          t.unavailableLine
                        )}
                      </h2>
                      {group.lines.map((line) => (
                    <article className="cart-line" key={line.offerId}>
                      {line.product && (
                        <ProductPhoto src={line.product.imageUrl} alt="" width={100} height={100} />
                      )}
                      <div className="cart-line-body">
                        <h3>
                          {line.product ? (
                            <Link href={localizedHref(`/product/${line.product.slug}`, locale)}>
                              {line.product.title[contentLocale(locale)]}
                            </Link>
                          ) : (
                            t.unavailableLine
                          )}
                        </h3>
                        {line.offer && (
                          <>
                            <p>
                              {t.price}: <bdi>{formatMoney(line.offer.priceMinor, locale)}</bdi>{' '}
                              <PromoPrice
                                priceMinor={line.offer.priceMinor}
                                regularPriceMinor={line.offer.regularPriceMinor}
                                endsAt={line.offer.promotionEndsAt}
                                locale={locale}
                              />
                            </p>
                          </>
                        )}
                        {line.offer?.preorder && (
                          <p className="preorder-note">
                            <strong className="preorder-badge">{preorderCopy[locale].badge}</strong>{' '}
                            {preorderText(line.offer.preorder, locale)}
                          </p>
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
                      {group.seller && (
                        <div className="seller-cart-subtotal">
                          <p>
                            <span>{t.sellerSubtotal}</span>
                            <strong>
                              <bdi>{formatMoney(group.subtotalMinor, locale)}</bdi>
                            </strong>
                          </p>
                          <p className="seller-cart-shipping">{t.sellerShipping}</p>
                        </div>
                      )}
                    </section>
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
                        guest={!token}
                        sellers={sellerGroups(result.cart.items).flatMap((group) =>
                          group.seller ? [{ id: group.seller.id, name: group.seller.name }] : [],
                        )}
                        preorder={preorderSpan(
                          result.cart.items.map((line) => ({ preorder: line.offer?.preorder })),
                        )}
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
