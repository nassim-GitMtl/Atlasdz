import { ArrowRight, CheckCircle, Storefront, Truck } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import type { CatalogProduct } from '@atlas/contracts';

import { ProductGrid } from '@/components/product-card';
import { SiteChrome } from '@/components/site-chrome';
import { EmptyState } from '@/components/states';
import { categoryImage } from '@/lib/catalog-view';
import { getProducts } from '@/lib/catalog-api';
import { copy, localizedHref, resolveLocale, text, type SearchParams } from '@/lib/i18n';

function catalogCategories(products: readonly CatalogProduct[]): CatalogProduct['category'][] {
  const unique = new Map<string, CatalogProduct['category']>();
  for (const product of products) unique.set(product.category.slug, product.category);
  return [...unique.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const t = copy[locale];
  const products = await getProducts();
  const categories = catalogCategories(products);

  return (
    <SiteChrome locale={locale} pathname="/" searchParams={params}>
      <div className="home-shell">
        <nav className="category-rail" aria-label={t.categoryTitle}>
          {categories.map((category) => (
            <Link href={localizedHref(`/category/${category.slug}`, locale)} key={category.slug}>
              <Image src={categoryImage(category.slug)} alt="" width={320} height={180} priority />
              <span>{text(category.title, locale)}</span>
            </Link>
          ))}
        </nav>

        <section className="hero-layout" aria-labelledby="hero-title">
          <article className="hero-card">
            <Image
              className="hero-image"
              src="/assets/hero-mobile-bazaar.png"
              alt=""
              fill
              priority
              sizes="(max-width: 980px) 100vw, 68vw"
            />
            <div className="hero-overlay" />
            <div className="hero-copy">
              <p className="hero-kicker">{t.heroKicker}</p>
              <h1 id="hero-title">
                {t.heroTitle.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p>{t.heroBody}</p>
              <Link className="button button--coral" href={localizedHref('/search', locale)}>
                {t.heroAction}
                <ArrowRight aria-hidden="true" size={20} weight="bold" />
              </Link>
            </div>
          </article>
          <aside className="hero-utilities">
            <article className="utility-card utility-card--delivery">
              <Image src="/assets/delivery-clear.png" alt="" width={210} height={130} />
              <div>
                <Truck aria-hidden="true" size={27} weight="duotone" />
                <h2>{t.deliveryTitle}</h2>
                <p>{t.deliveryBody}</p>
              </div>
            </article>
            <article className="utility-card utility-card--seller">
              <Image src="/assets/payment-flexible.png" alt="" width={210} height={130} />
              <div>
                <Storefront aria-hidden="true" size={27} weight="duotone" />
                <h2>{t.sellerTitle}</h2>
                <p>{t.sellerBody}</p>
              </div>
            </article>
          </aside>
        </section>

        <section className="home-section" aria-labelledby="categories-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t.catalog}</p>
              <h2 id="categories-title">{t.categoryTitle}</h2>
              <p>{t.categoryBody}</p>
            </div>
          </div>
          <div className="category-cards">
            {categories.map((category) => (
              <Link href={localizedHref(`/category/${category.slug}`, locale)} key={category.slug}>
                <Image src={categoryImage(category.slug)} alt="" width={520} height={300} />
                <span>
                  <strong>{text(category.title, locale)}</strong>
                  <ArrowRight aria-hidden="true" size={19} weight="bold" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-section home-section--products" aria-labelledby="offers-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t.browseKicker}</p>
              <h2 id="offers-title">{t.offersTitle}</h2>
              <p>{t.offersBody}</p>
            </div>
            <Link className="section-link" href={localizedHref('/search', locale)}>
              {t.allOffers}
              <ArrowRight aria-hidden="true" size={18} weight="bold" />
            </Link>
          </div>
          {products.length > 0 ? (
            <ProductGrid locale={locale} products={products.slice(0, 4)} />
          ) : (
            <EmptyState locale={locale} />
          )}
        </section>

        <section className="trust-grid" aria-label={t.compareTitle}>
          <article>
            <span>
              <Storefront aria-hidden="true" size={31} weight="duotone" />
            </span>
            <h2>{t.sellerTitle}</h2>
            <p>{t.sellerBody}</p>
          </article>
          <article>
            <span>
              <Truck aria-hidden="true" size={31} weight="duotone" />
            </span>
            <h2>{t.deliveryTitle}</h2>
            <p>{t.deliveryBody}</p>
          </article>
          <article>
            <span>
              <CheckCircle aria-hidden="true" size={31} weight="duotone" />
            </span>
            <h2>{t.compareTitle}</h2>
            <p>{t.compareBody}</p>
          </article>
        </section>
      </div>
    </SiteChrome>
  );
}
