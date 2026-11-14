import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import type { CatalogProduct } from '@atlas/contracts';

import { parseSort, sortProducts } from '@/lib/catalog-view';
import { copy, localizedHref, text, type Locale } from '@/lib/i18n';

import { EmptyState } from './states';
import { ProductGrid } from './product-card';

interface CatalogResultsProps {
  readonly allProducts: readonly CatalogProduct[];
  readonly availableOnly: boolean;
  readonly category?: string | undefined;
  readonly locale: Locale;
  readonly products: readonly CatalogProduct[];
  readonly query?: string | undefined;
  readonly sort?: string | undefined;
  readonly title: string;
}

function categories(products: readonly CatalogProduct[]): CatalogProduct['category'][] {
  const unique = new Map<string, CatalogProduct['category']>();
  for (const product of products) unique.set(product.category.slug, product.category);
  return [...unique.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

export function CatalogResults({
  allProducts,
  availableOnly,
  category,
  locale,
  products,
  query,
  sort,
  title,
}: CatalogResultsProps) {
  const t = copy[locale];
  const visible = sortProducts(
    availableOnly
      ? products.filter((product) => product.offers.some((offer) => offer.availableQuantity > 0))
      : products,
    parseSort(sort),
  );
  const catalogCategories = categories(allProducts);

  return (
    <>
      <header className="browse-heading">
        <p className="eyebrow">{t.browseKicker}</p>
        <h1>{title}</h1>
        <p className="result-count">
          <strong>{visible.length}</strong> {visible.length === 1 ? t.result : t.results}
        </p>
      </header>
      <section className="filter-panel" aria-labelledby="filters-title">
        <div className="filter-title" id="filters-title">
          <SlidersHorizontal aria-hidden="true" size={19} weight="bold" />
          {t.filterTitle}
        </div>
        <nav className="category-chips" aria-label={t.categoryTitle}>
          <Link
            className={category ? '' : 'is-selected'}
            href={localizedHref('/search', locale, query ? { query } : {})}
          >
            {t.allCategories}
          </Link>
          {catalogCategories.map((item) => (
            <Link
              className={category === item.slug ? 'is-selected' : ''}
              href={localizedHref(`/category/${item.slug}`, locale, query ? { query } : {})}
              key={item.slug}
            >
              {text(item.title, locale)}
            </Link>
          ))}
        </nav>
        <form className="sort-form" action={category ? `/category/${category}` : '/search'}>
          <input name="lang" type="hidden" value={locale} />
          {query ? <input name="query" type="hidden" value={query} /> : null}
          <label className="availability-check">
            <input defaultChecked={availableOnly} name="available" type="checkbox" value="1" />
            <span>{t.availableOnly}</span>
          </label>
          <label className="sort-select">
            <span>{t.sort}</span>
            <select defaultValue={parseSort(sort)} name="sort">
              <option value="recommended">{t.recommended}</option>
              <option value="price-asc">{t.priceLow}</option>
              <option value="price-desc">{t.priceHigh}</option>
              <option value="fastest">{t.fastest}</option>
            </select>
          </label>
          <button className="button button--secondary" type="submit">
            {t.apply}
          </button>
          {(availableOnly || sort || query) && (
            <Link
              className="clear-filter"
              href={localizedHref(category ? `/category/${category}` : '/search', locale)}
            >
              {t.clear}
            </Link>
          )}
        </form>
      </section>
      {visible.length > 0 ? (
        <ProductGrid locale={locale} products={visible} />
      ) : (
        <EmptyState locale={locale} />
      )}
    </>
  );
}
