import { Breadcrumbs } from '@/components/breadcrumbs';
import { CatalogResults } from '@/components/catalog-results';
import { SiteChrome } from '@/components/site-chrome';
import { getCategories, getProductPage } from '@/lib/catalog-api';
import { parsePriceBound, parseSort } from '@/lib/catalog-view';
import { firstParam, lang, resolveLocale, text, type SearchParams } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = resolveLocale(query.lang);
  const category = (await getCategories().catch(() => [])).find((item) => item.slug === slug);
  if (!category) return {};
  const title = text(category.title, locale);
  const path = `/category/${slug}`;
  return {
    title,
    description: lang(
      locale,
      `${title} : ${category.productCount} produit(s) de vendeurs algériens, payés à la livraison.`,
      `${title}: ${category.productCount} منتج من بائعين جزائريين، الدفع عند الاستلام.`,
      `${title}: ${category.productCount} product(s) from Algerian sellers, cash on delivery.`,
    ),
    alternates: {
      canonical: path,
      languages: { fr: path, ar: `${path}?lang=ar`, en: `${path}?lang=en` },
    },
    // Filtered or sorted variants are not separate pages for search engines.
    ...(firstParam(query.query) || firstParam(query.sort) || firstParam(query.min) || firstParam(query.max)
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}

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
  const minPrice = parsePriceBound(firstParam(queryParams.min));
  const maxPrice = parsePriceBound(firstParam(queryParams.max));
  const pageNumber = Math.min(1000, Math.max(1, Number(firstParam(queryParams.page)) || 1));
  const [results, categories] = await Promise.all([
    getProductPage({
      category: slug,
      query,
      sort: parseSort(sort),
      available: availableOnly,
      ...(minPrice !== undefined ? { minPrice: minPrice * 100 } : {}),
      ...(maxPrice !== undefined ? { maxPrice: maxPrice * 100 } : {}),
      page: pageNumber,
    }),
    getCategories().catch(() => []),
  ]);
  const category = categories.find((item) => item.slug === slug);
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
          results={results}
          categories={categories}
          availableOnly={availableOnly}
          minPrice={minPrice}
          maxPrice={maxPrice}
          category={slug}
          locale={locale}
          query={query}
          sort={sort}
          title={title}
        />
      </div>
    </SiteChrome>
  );
}
