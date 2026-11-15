import { notFound } from 'next/navigation';
import type { CatalogSeller } from '@atlas/contracts';
import { Storefront } from '@phosphor-icons/react/dist/ssr';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-card';
import { SiteChrome } from '@/components/site-chrome';
import { ReviewsSection } from '@/components/reviews-section';
import { EmptyState } from '@/components/states';
import { CatalogNotFoundError, getProductPage, getReviews, getSeller } from '@/lib/catalog-api';
import { copy, resolveLocale, text, type SearchParams } from '@/lib/i18n';

export default async function StorePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(query.lang);
  let seller: CatalogSeller;
  try {
    seller = await getSeller(slug);
  } catch (error) {
    if (error instanceof CatalogNotFoundError) notFound();
    throw error;
  }
  const [products, reviews] = await Promise.all([
    getProductPage({ seller: slug, limit: 100 }).then((page) => page.items),
    getReviews('sellers', slug).catch(() => null),
  ]);
  const t = copy[locale];
  return (
    <SiteChrome locale={locale} pathname={`/store/${slug}`} searchParams={query}>
      <div className="page-shell">
        <Breadcrumbs locale={locale} items={[{ label: seller.name }]} />
        <section className="store-hero">
          <div className="store-avatar">
            <Storefront size={56} weight="duotone" aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">{t.sellerStore}</p>
            <h1>{seller.name}</h1>
            <p>{text(seller.description, locale)}</p>
          </div>
        </section>
        <div className="section-heading">
          <h2>{t.sellerOffers}</h2>
          <span className="count-pill">{products.length}</span>
        </div>
        {products.length ? (
          <ProductGrid products={products} locale={locale} />
        ) : (
          <EmptyState locale={locale} />
        )}
        {reviews && <ReviewsSection page={reviews} locale={locale} showProduct />}
      </div>
    </SiteChrome>
  );
}
