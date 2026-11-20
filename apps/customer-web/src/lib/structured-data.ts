import type { CatalogProduct } from '@atlas/contracts';
import type { ReviewSummary } from '@atlas/contracts';

type Locale = 'fr' | 'ar' | 'en';
const pick = (text: { fr: string; ar: string; en?: string | undefined }, locale: Locale) =>
  locale === 'en' ? (text.en ?? text.fr) : text[locale];

/**
 * schema.org Product data for search engines, built only from what the page shows: the seller
 * offers, stated characteristics and real customer reviews (no rating without reviews).
 */
export function productJsonLd(
  product: CatalogProduct,
  summary: ReviewSummary | null,
  locale: Locale,
  origin: string,
): Record<string, unknown> {
  const url = `${origin}/product/${product.slug}${locale === 'fr' ? '' : `?lang=${locale}`}`;
  const offers = product.offers.map((offer) => ({
    '@type': 'Offer',
    price: (offer.priceMinor / 100).toFixed(2),
    priceCurrency: offer.currency,
    availability: offer.preorder
      ? 'https://schema.org/PreOrder'
      : offer.availableQuantity > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    seller: { '@type': 'Organization', name: offer.seller.name },
    url,
  }));
  const prices = product.offers.map((offer) => offer.priceMinor / 100);
  const brand = product.specs?.find((spec) => spec.key === 'brand')?.value;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pick(product.title, locale),
    description: pick(product.description, locale).slice(0, 5000),
    image: [product.imageUrl, ...(product.gallery ?? [])].map((path) => `${origin}${path}`),
    category: pick(product.category.title, locale),
    url,
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    offers:
      offers.length === 1
        ? offers[0]
        : {
            '@type': 'AggregateOffer',
            priceCurrency: 'DZD',
            lowPrice: Math.min(...prices).toFixed(2),
            highPrice: Math.max(...prices).toFixed(2),
            offerCount: offers.length,
            offers,
          },
    ...(summary && summary.count > 0 && summary.average !== null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Math.round(summary.average * 10) / 10,
            reviewCount: summary.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** schema.org WebSite with the catalogue search, for the home page. */
export function websiteJsonLd(origin: string, name: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: `${origin}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?query={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** schema.org BreadcrumbList: home, category, product. */
export function breadcrumbJsonLd(
  origin: string,
  items: readonly { readonly name: string; readonly path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}

/** JSON for an inline data script: `<` is escaped so seller text cannot close the tag. */
export const jsonForScript = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    // Line and paragraph separators are valid in JSON but not in older script parsers.
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
