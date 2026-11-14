import { ProductPhoto } from '@/components/product-photo';
import { notFound } from 'next/navigation';
import type { CatalogProduct } from '@atlas/contracts';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { OfferSelector } from '@/components/offer-selector';
import { SiteChrome } from '@/components/site-chrome';
import type { Metadata } from 'next';
import { ReviewsSection } from '@/components/reviews-section';
import { CatalogNotFoundError, getProduct, getReviews } from '@/lib/catalog-api';
import { copy, localizedHref, resolveLocale, text, type SearchParams } from '@/lib/i18n';

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
  const reviews = await getReviews('products', slug).catch(() => null);
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
          <div className="product-detail__image">
            <ProductPhoto
              src={product.imageUrl}
              alt={title}
              width={850}
              height={700}
              priority
              sizes="(max-width: 760px) 100vw, 45vw"
            />
          </div>
          <div className="product-detail__content">
            <p className="eyebrow">{text(product.category.title, locale)}</p>
            <h1>{title}</h1>
            <p className="product-description">{text(product.description, locale)}</p>
            <div className="seller-notice">{t.footerScope}</div>
            <OfferSelector offers={product.offers} locale={locale} />
          </div>
        </section>
        <section className="product-information">
          <h2>{t.productDetails}</h2>
          <p>{text(product.description, locale)}</p>
          <p>
            {locale === 'ar'
              ? 'مدة التحضير ليست موعد الوصول. يحدد البائع خيارات التوصيل حسب العنوان.'
              : 'Le délai de préparation ne correspond pas au délai de livraison. Les options de livraison dépendent du vendeur et de votre adresse.'}
          </p>
        </section>
        {reviews && <ReviewsSection page={reviews} locale={locale} />}
      </div>
    </SiteChrome>
  );
}
