import Link from 'next/link';
import type { CatalogProduct } from '@atlas/contracts';
import { ProductPhoto } from './product-photo';
import { FavoriteToggle } from './favorite-toggle';
import { PromoPrice } from './promo-price';
import { bestOffer, formatMoney } from '@/lib/catalog-view';
import { copy, localizedHref, text, type Locale } from '@/lib/i18n';

export function ProductCard({ product, locale }: { readonly product: CatalogProduct; readonly locale: Locale }) {
  const t = copy[locale];
  const offer = bestOffer(product);
  const title = text(product.title, locale);
  const sellers = new Set(product.offers.map((item) => item.seller.id)).size;
  return (
    <article className="product-card">
      <div className="product-card__visual">
        <Link className="product-card__image" href={localizedHref(`/product/${product.slug}`, locale)}>
          <ProductPhoto src={product.imageUrl} alt={title} width={560} height={560} sizes="(max-width: 760px) 50vw, 25vw" />
          {offer.availableQuantity === 0 && <span className="stock-badge stock-badge--empty">{t.unavailable}</span>}
        </Link>
        <FavoriteToggle slug={product.slug} title={title} locale={locale} />
      </div>
      <div className="product-card__body">
        <h3><Link href={localizedHref(`/product/${product.slug}`, locale)}>{title}</Link></h3>
        <p className="product-card__seller">{sellers > 1 ? `${sellers} ${locale === 'ar' ? 'بائعين' : 'vendeurs'}` : <Link href={localizedHref(`/store/${offer.seller.slug}`, locale)}>{offer.seller.name}</Link>}</p>
        <div className="product-card__bottom">
          <p className="price-line">{sellers > 1 && <small>{t.from}</small>}<strong><bdi>{formatMoney(offer.priceMinor, locale)}</bdi></strong></p>
          <PromoPrice priceMinor={offer.priceMinor} regularPriceMinor={offer.regularPriceMinor} endsAt={offer.promotionEndsAt} locale={locale} compact />
          <span className="product-card__handling">{offer.preorder ? (locale === 'ar' ? 'طلب مسبق' : 'Précommande') : `${t.preparation} ${offer.handlingDays} ${offer.handlingDays === 1 ? t.day : t.days}`}</span>
        </div>
      </div>
    </article>
  );
}
export function ProductGrid({ products, locale }: { readonly products: readonly CatalogProduct[]; readonly locale: Locale }) {
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} locale={locale} />)}</div>;
}
