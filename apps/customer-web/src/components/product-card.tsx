import { ArrowRight, Clock, Storefront, Truck } from '@phosphor-icons/react/dist/ssr';
import { ProductPhoto } from './product-photo';
import Link from 'next/link';

import type { CatalogProduct } from '@atlas/contracts';

import { bestOffer, formatMoney } from '@/lib/catalog-view';
import { copy, localizedHref, text, type Locale } from '@/lib/i18n';

export function ProductCard({
  product,
  locale,
}: {
  readonly product: CatalogProduct;
  readonly locale: Locale;
}) {
  const t = copy[locale];
  const offer = bestOffer(product);
  const available = offer.availableQuantity > 0;
  const title = text(product.title, locale);
  const handlingUnit = offer.handlingDays === 1 ? t.day : t.days;

  return (
    <article className="product-card">
      <Link
        className="product-card__image"
        href={localizedHref(`/product/${product.slug}`, locale)}
      >
        <ProductPhoto
          src={product.imageUrl}
          alt={title}
          width={560}
          height={430}
          sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw"
        />
        <span
          className={`stock-badge ${available ? 'stock-badge--available' : 'stock-badge--empty'}`}
        >
          <i aria-hidden="true" />
          {available ? `${offer.availableQuantity} ${t.stock}` : t.unavailable}
        </span>
      </Link>
      <div className="product-card__body">
        <p className="product-category">{text(product.category.title, locale)}</p>
        <h3>
          <Link href={localizedHref(`/product/${product.slug}`, locale)}>{title}</Link>
        </h3>
        <p className="price-line">
          <small>{t.from}</small>
          <strong dir="ltr">{formatMoney(offer.priceMinor, locale)}</strong>
        </p>
        <dl className="offer-summary">
          <div>
            <dt>
              <Storefront aria-hidden="true" size={16} />
              {t.soldBy}
            </dt>
            <dd>
              <Link href={localizedHref(`/store/${offer.seller.slug}`, locale)}>
                {offer.seller.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>
              <Clock aria-hidden="true" size={16} />
              {t.preparation}
            </dt>
            <dd>
              {offer.handlingDays} {handlingUnit}
            </dd>
          </div>
          <div>
            <dt>
              <Truck aria-hidden="true" size={16} />
              {t.deliveryFee}
            </dt>
            <dd>{t.shippingAtCheckout}</dd>
          </div>
        </dl>
        <Link
          className="product-card__action"
          href={localizedHref(`/product/${product.slug}`, locale)}
        >
          {product.offers.length > 1 ? t.compareOffers : t.viewProduct}
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  locale,
}: {
  readonly products: readonly CatalogProduct[];
  readonly locale: Locale;
}) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} locale={locale} />
      ))}
    </div>
  );
}
