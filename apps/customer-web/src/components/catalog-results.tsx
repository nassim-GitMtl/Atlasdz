import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import type { CatalogCategoryList } from '@atlas/contracts';

import type { ProductPage } from '@/lib/catalog-api';
import { parseSort } from '@/lib/catalog-view';
import { copy, localizedHref, text, type Locale } from '@/lib/i18n';

import { EmptyState } from './states';
import { ProductGrid } from './product-card';

interface CatalogResultsProps {
  /** One page, already sorted and filtered by the API across the whole catalogue. */
  readonly results: ProductPage;
  readonly categories: CatalogCategoryList['items'];
  readonly availableOnly: boolean;
  /** Price range in whole dinars, as entered. */
  readonly minPrice?: number | undefined;
  readonly maxPrice?: number | undefined;
  readonly category?: string | undefined;
  readonly locale: Locale;
  readonly query?: string | undefined;
  readonly sort?: string | undefined;
  readonly title: string;
}

export function CatalogResults({
  results,
  categories,
  availableOnly,
  minPrice,
  maxPrice,
  category,
  locale,
  query,
  sort,
  title,
}: CatalogResultsProps) {
  const t = copy[locale];
  const path = category ? `/category/${category}` : '/search';
  const pages = Math.max(1, Math.ceil(results.total / Math.max(1, results.pageSize)));
  // Links keep the search, filter and sort; only the page changes.
  const pageHref = (page: number) =>
    localizedHref(path, locale, {
      ...(query ? { query } : {}),
      ...(sort ? { sort } : {}),
      ...(availableOnly ? { available: '1' } : {}),
      ...(minPrice !== undefined ? { min: String(minPrice) } : {}),
      ...(maxPrice !== undefined ? { max: String(maxPrice) } : {}),
      ...(page > 1 ? { page: String(page) } : {}),
    });

  return (
    <>
      <header className="browse-heading">
        <p className="eyebrow">{t.browseKicker}</p>
        <h1>{title}</h1>
        <p className="result-count">
          <strong>{results.total}</strong> {results.total === 1 ? t.result : t.results}
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
          {categories.map((item) => (
            <Link
              className={category === item.slug ? 'is-selected' : ''}
              href={localizedHref(`/category/${item.slug}`, locale, query ? { query } : {})}
              key={item.slug}
            >
              {text(item.title, locale)} <span className="chip-count">{item.productCount}</span>
            </Link>
          ))}
        </nav>
        <form className="sort-form" action={path}>
          <input name="lang" type="hidden" value={locale} />
          {query ? <input name="query" type="hidden" value={query} /> : null}
          <label className="availability-check">
            <input defaultChecked={availableOnly} name="available" type="checkbox" value="1" />
            <span>{t.availableOnly}</span>
          </label>
          <label className="price-bound">
            <span>{t.priceFrom}</span>
            <input
              defaultValue={minPrice}
              inputMode="numeric"
              min={0}
              name="min"
              pattern="[0-9]*"
              type="number"
            />
          </label>
          <label className="price-bound">
            <span>{t.priceTo}</span>
            <input
              defaultValue={maxPrice}
              inputMode="numeric"
              min={0}
              name="max"
              pattern="[0-9]*"
              type="number"
            />
          </label>
          <label className="sort-select">
            <span>{t.sort}</span>
            <select defaultValue={parseSort(sort)} name="sort">
              <option value="recommended">{t.recommended}</option>
              <option value="price-asc">{t.priceLow}</option>
              <option value="price-desc">{t.priceHigh}</option>
              <option value="fastest">{t.fastest}</option>
              <option value="newest">{t.newest}</option>
            </select>
          </label>
          <button className="button button--secondary" type="submit">
            {t.apply}
          </button>
          {(availableOnly || sort || query || minPrice !== undefined || maxPrice !== undefined) && (
            <Link className="clear-filter" href={localizedHref(path, locale)}>
              {t.clear}
            </Link>
          )}
        </form>
      </section>
      {results.items.length > 0 ? (
        <ProductGrid locale={locale} products={results.items} />
      ) : (
        <EmptyState locale={locale} />
      )}
      {pages > 1 && (
        <nav className="pagination" aria-label={t.pageOf(results.page, pages)}>
          {results.page > 1 ? (
            <Link className="button button--secondary" href={pageHref(results.page - 1)} rel="prev">
              {t.previousPage}
            </Link>
          ) : (
            <span />
          )}
          <span aria-current="page">{t.pageOf(results.page, pages)}</span>
          {results.page < pages ? (
            <Link className="button button--secondary" href={pageHref(results.page + 1)} rel="next">
              {t.nextPage}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
