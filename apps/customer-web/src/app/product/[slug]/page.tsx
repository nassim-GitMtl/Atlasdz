import { ProductGallery } from '@/components/product-gallery';
import { notFound } from 'next/navigation';
import type { CatalogProduct } from '@atlas/contracts';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { OfferSelector } from '@/components/offer-selector';
import { DeliveryEstimate } from '@/components/delivery-estimate';
import { SiteChrome } from '@/components/site-chrome';
import type { Metadata } from 'next';
import { ReviewsSection } from '@/components/reviews-section';
import { Money, Truck } from '@phosphor-icons/react/dist/ssr';
import { ProductGrid } from '@/components/product-card';
import { CatalogNotFoundError, getProduct, getProductPage, getReviews } from '@/lib/catalog-api';
import { copy, localizedHref, resolveLocale, text, type SearchParams, lang } from '@/lib/i18n';

export async function generateMetadata({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(query.lang);
  const product = await getProduct(slug).catch(() => null);
  if (product === null) return {};
  const title = text(product.title, locale);
  const description = text(product.description, locale).slice(0, 180);
  return {
    title,
    description,
    alternates: { canonical: `/product/${slug}`, languages: { ar: `/product/${slug}?lang=ar` } },
    openGraph: { title, description, images: [{ url: product.imageUrl }] },
  };
}

const factCopy = {
  fr: {
    codTitle: 'Paiement à la livraison.',
    cod: 'Vous payez le vendeur ou son livreur à la réception, pas Atlas DZ.',
    shippingTitle: 'Livraison par le vendeur.',
    shipping: 'Une seule livraison par vendeur, au tarif de votre commune, affichée avant de confirmer.',
    related: 'Dans la même catégorie',
  },
  ar: {
    codTitle: 'الدفع عند الاستلام.',
    cod: 'تدفع للبائع أو لمندوبه عند الاستلام، وليس لأطلس DZ.',
    shippingTitle: 'التوصيل من البائع.',
    shipping: 'توصيل واحد لكل بائع حسب تعريفة بلديتك، يظهر قبل التأكيد.',
    related: 'من نفس الفئة',
  },
  en: {
    codTitle: 'Cash on delivery.',
    cod: 'You pay the seller or its courier on receipt, not Atlas DZ.',
    shippingTitle: 'Delivered by the seller.',
    shipping: 'One delivery per seller, at your commune’s rate, shown before you confirm.',
    related: 'In the same category',
  },
} as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(query.lang);
  let product: CatalogProduct;
  try {
    product = await getProduct(slug);
  } catch (error) {
    if (error instanceof CatalogNotFoundError) notFound();
    throw error;
  }
  // Reviews are optional on the page: an outage there must not hide the product.
  const [reviews, related] = await Promise.all([
    getReviews('products', slug).catch(() => null),
    // Real products from the same category; nothing is shown when there are none.
    getProductPage({ category: product.category.slug, limit: 5 })
      .then((page) => page.items.filter((item) => item.slug !== slug).slice(0, 4))
      .catch(() => []),
  ]);
  const facts = factCopy[locale];
  const t = copy[locale];
  const title = text(product.title, locale);
  return (
    <SiteChrome locale={locale} pathname={`/product/${slug}`} searchParams={query}>
      <div className="page-shell">
        <Breadcrumbs
          locale={locale}
          items={[
            {
              label: text(product.category.title, locale),
              href: localizedHref(`/category/${product.category.slug}`, locale),
            },
            { label: title },
          ]}
        />
        <section className="product-detail">
          <ProductGallery
            photos={[product.imageUrl, ...(product.gallery ?? [])]}
            alt={title}
            label={lang(locale, 'Photos du produit', 'صور المنتج', 'Product photos')}
          />
          <div className="product-detail__content">
            <p className="eyebrow">{text(product.category.title, locale)}</p>
            <h1>{title}</h1>
            <p className="product-description">{text(product.description, locale)}</p>
            <OfferSelector offers={product.offers} productSlug={product.slug} locale={locale} />
            <DeliveryEstimate
              locale={locale}
              sellers={[
                ...new Map(product.offers.map((o) => [o.seller.id, { id: o.seller.id, name: o.seller.name }])).values(),
              ]}
            />
            <div className="fulfilment-facts">
              <p>
                <Money aria-hidden="true" size={20} />
                <span>
                  <strong>{facts.codTitle}</strong> {facts.cod}
                </span>
              </p>
              <p>
                <Truck aria-hidden="true" size={20} />
                <span>
                  <strong>{facts.shippingTitle}</strong> {facts.shipping}
                </span>
              </p>
            </div>
          </div>
        </section>
        <div className="product-lower">
        <section className="product-information">
          <h2>{t.productDetails}</h2>
          <p>{text(product.description, locale)}</p>
          <p>
            {lang(
              locale,
              'Le délai de préparation ne correspond pas au délai de livraison. Les options de livraison dépendent du vendeur et de votre adresse.',
              'مدة التحضير ليست موعد الوصول. يحدد البائع خيارات التوصيل حسب العنوان.',
              'Preparation time is not delivery time. Delivery options depend on the seller and your address.',
            )}
          </p>
        </section>
        {reviews && <ReviewsSection page={reviews} locale={locale} />}
        </div>
        {related.length > 0 && (
          <section className="related-products" aria-labelledby="related-title">
            <h2 id="related-title">{facts.related}</h2>
            <ProductGrid products={related} locale={locale} />
          </section>
        )}
      </div>
    </SiteChrome>
  );
}
