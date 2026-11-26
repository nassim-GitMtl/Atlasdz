import { notFound } from 'next/navigation';
import type { CatalogSeller } from '@atlas/contracts';
import { Storefront } from '@phosphor-icons/react/dist/ssr';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-card';
import { ProductPhoto } from '@/components/product-photo';
import { SiteChrome } from '@/components/site-chrome';
import { ReviewsSection } from '@/components/reviews-section';
import { EmptyState } from '@/components/states';
import { CatalogNotFoundError, getProductPage, getReviews, getSeller } from '@/lib/catalog-api';
import { copy, intlLocale, lang, resolveLocale, text, type SearchParams } from '@/lib/i18n';
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
  const seller = await getSeller(slug).catch(() => null);
  if (seller === null) return {};
  const path = `/store/${slug}`;
  return {
    title: seller.name,
    description: text(seller.description, locale).slice(0, 180),
    alternates: {
      canonical: path,
      languages: { fr: path, ar: `${path}?lang=ar`, en: `${path}?lang=en` },
    },
  };
}

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
            {seller.logoUrl ? (
              <span className="store-avatar__logo">
                <ProductPhoto src={seller.logoUrl} alt="" width={96} height={96} />
              </span>
            ) : (
              <Storefront size={56} weight="duotone" aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="eyebrow">{t.sellerStore}</p>
            <h1>{seller.name}</h1>
            <p>{text(seller.description, locale)}</p>
            {seller.legal && (
              <details className="seller-legal">
                <summary>{lang(locale, 'Informations légales du vendeur', 'المعلومات القانونية للبائع', 'Seller legal information')}</summary>
                <dl>
                  <dt>{lang(locale, 'Nom ou raison sociale', 'الاسم أو التسمية التجارية', 'Name or company name')}</dt>
                  <dd>{seller.legal.legalName}</dd>
                  <dt>
                    {{
                      COMMERCE: lang(locale, 'Registre du commerce', 'السجل التجاري', 'Commerce register'),
                      ARTISAN: lang(locale, 'Carte d’artisan', 'بطاقة الحرفي', 'Craftsman card'),
                      AUTO_ENTREPRENEUR: lang(locale, 'Carte d’auto-entrepreneur', 'بطاقة المقاول الذاتي', 'Auto-entrepreneur card'),
                    }[seller.legal.registerKind]}
                  </dt>
                  <dd><bdi>{seller.legal.registerNumber}</bdi></dd>
                  <dt>{lang(locale, 'NIF', 'رقم التعريف الجبائي', 'Tax ID (NIF)')}</dt>
                  <dd><bdi>{seller.legal.taxId}</bdi></dd>
                  <dt>{lang(locale, 'Adresse', 'العنوان', 'Address')}</dt>
                  <dd>{seller.legal.address}</dd>
                  <dt>{lang(locale, 'Téléphone', 'الهاتف', 'Phone')}</dt>
                  <dd><a href={`tel:${seller.legal.phone}`} dir="ltr">{seller.legal.phone}</a></dd>
                  <dt>{lang(locale, 'E-mail', 'البريد الإلكتروني', 'Email')}</dt>
                  <dd><a href={`mailto:${seller.legal.email}`} dir="ltr">{seller.legal.email}</a></dd>
                </dl>
                <p>
                  {lang(
                    locale,
                    'Informations déclarées par le vendeur (loi 18-05 relative au commerce électronique).',
                    'معلومات صرّح بها البائع (القانون 18-05 المتعلق بالتجارة الإلكترونية).',
                    'Information declared by the seller (Algerian e-commerce law 18-05).',
                  )}
                </p>
              </details>
            )}
            {seller.holidayUntil && (
              <p className="notice" role="status">
                {lang(locale, 'Boutique en congé jusqu’au ', 'المتجر في عطلة حتى ', 'Shop on holiday until ')}
                <strong>
                  {new Date(seller.holidayUntil).toLocaleDateString(intlLocale(locale), {
                    dateStyle: 'long',
                    timeZone: 'Africa/Algiers',
                  })}
                </strong>
                {lang(
                  locale,
                  '. Ses offres reviendront ensuite.',
                  '. ستعود عروضه بعد ذلك.',
                  '. Its offers will be back after that.',
                )}
              </p>
            )}
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
