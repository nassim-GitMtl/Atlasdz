import { Breadcrumbs } from '@/components/breadcrumbs';
import { CatalogResults } from '@/components/catalog-results';
import { SiteChrome } from '@/components/site-chrome';
import { getProducts } from '@/lib/catalog-api';
import { copy, firstParam, resolveLocale, type SearchParams } from '@/lib/i18n';

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
  const [products, allProducts] = await Promise.all([
    getProducts({ query, category, seller }),
    getProducts(),
  ]);
  const t = copy[locale];
  const title = query ? `${t.resultsFor} « ${query} »` : t.allProducts;

  return (
    <SiteChrome locale={locale} pathname="/search" searchParams={params} searchValue={query}>
      <div className="page-shell">
        <Breadcrumbs locale={locale} items={[{ label: title }]} />
        <CatalogResults
          allProducts={allProducts}
          availableOnly={availableOnly}
          category={category}
          locale={locale}
          products={products}
          query={query}
          sort={sort}
          title={title}
        />
      </div>
    </SiteChrome>
  );
}
