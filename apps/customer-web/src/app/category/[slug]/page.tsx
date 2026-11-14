import { Breadcrumbs } from '@/components/breadcrumbs';
import { CatalogResults } from '@/components/catalog-results';
import { SiteChrome } from '@/components/site-chrome';
import { getProducts } from '@/lib/catalog-api';
import { firstParam, resolveLocale, text, type SearchParams } from '@/lib/i18n';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, queryParams] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(queryParams.lang);
  const query = firstParam(queryParams.query)?.trim();
  const sort = firstParam(queryParams.sort);
  const availableOnly = firstParam(queryParams.available) === '1';
  const [products, allProducts] = await Promise.all([
    getProducts({ category: slug, query }),
    getProducts(),
  ]);
  const category = allProducts.find((product) => product.category.slug === slug)?.category;
  const title = category ? text(category.title, locale) : slug.replaceAll('-', ' ');

  return (
    <SiteChrome
      locale={locale}
      pathname={`/category/${slug}`}
      searchParams={queryParams}
      searchValue={query}
    >
      <div className="page-shell">
        <Breadcrumbs locale={locale} items={[{ label: title }]} />
        <CatalogResults
          allProducts={allProducts}
          availableOnly={availableOnly}
          category={slug}
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
