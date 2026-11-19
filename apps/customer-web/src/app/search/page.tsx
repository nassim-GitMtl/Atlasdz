import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { CatalogResults } from '@/components/catalog-results';
import { SiteChrome } from '@/components/site-chrome';
import { getCategories, getProductPage } from '@/lib/catalog-api';
import { parsePriceBound, parseSort } from '@/lib/catalog-view';
import { copy, firstParam, resolveLocale, type SearchParams } from '@/lib/i18n';

/** Result pages are for shoppers, not search engines (categories are the indexable lists). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const query = firstParam(params.query)?.trim();
  const category = firstParam(params.category)?.trim();
  const seller = firstParam(params.seller)?.trim();
  const sort = firstParam(params.sort);
  const availableOnly = firstParam(params.available) === '1';
  const minPrice = parsePriceBound(firstParam(params.min));
  const maxPrice = parsePriceBound(firstParam(params.max));
  const pageNumber = Math.min(1000, Math.max(1, Number(firstParam(params.page)) || 1));
  const [results, categories] = await Promise.all([
    getProductPage({
      query,
      category,
      seller,
      sort: parseSort(sort),
      available: availableOnly,
      ...(minPrice !== undefined ? { minPrice: minPrice * 100 } : {}),
      ...(maxPrice !== undefined ? { maxPrice: maxPrice * 100 } : {}),
      page: pageNumber,
    }),
    getCategories().catch(() => []),
  ]);
  const t = copy[locale];
  const title = query ? `${t.resultsFor} « ${query} »` : t.allProducts;

  return (
    <SiteChrome locale={locale} pathname="/search" searchParams={params} searchValue={query}>
      <div className="page-shell">
        <Breadcrumbs locale={locale} items={[{ label: title }]} />
        <CatalogResults
          results={results}
          categories={categories}
          availableOnly={availableOnly}
          minPrice={minPrice}
          maxPrice={maxPrice}
          category={category}
          locale={locale}
          query={query}
          sort={sort}
          title={title}
        />
      </div>
    </SiteChrome>
  );
}
