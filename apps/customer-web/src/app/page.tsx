import { ArrowRight } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import { ProductGrid } from '@/components/product-card';
import { RecentStrip } from '@/components/recent-strip';
import { jsonForScript, websiteJsonLd } from '@/lib/structured-data';
import { SiteChrome } from '@/components/site-chrome';
import { EmptyState } from '@/components/states';
import { categoryImage } from '@/lib/catalog-view';
import { getCategories, getProductPage } from '@/lib/catalog-api';
import { copy, localizedHref, resolveLocale, text, type SearchParams } from '@/lib/i18n';

const editorial = {
  fr: { title: 'Trouvez votre prochain coup de cœur.', body: 'Les offres de vendeurs algériens, payées à la livraison.', phones: 'Smartphones et écouteurs.', beauty: 'Le rituel beauté.', kitchen: 'Le coin cuisine.', all: 'Tout le catalogue' },
  en: { title: 'Find your next favourite.', body: 'Offers from Algerian sellers, paid on delivery.', phones: 'Smartphones and earbuds.', beauty: 'The beauty routine.', kitchen: 'The kitchen corner.', all: 'All products' },
  ar: { title: 'اعثر على قطعتك المفضلة التالية.', body: 'عروض لبائعين جزائريين، والدفع عند الاستلام.', phones: 'هواتف ذكية وسماعات.', beauty: 'روتين الجمال.', kitchen: 'ركن المطبخ.', all: 'كل الكتالوج' },
} as const;

function productCount(count: number, locale: 'fr' | 'ar' | 'en'): string {
  if (locale === 'fr') return `${count} produit${count > 1 ? 's' : ''}`;
  if (locale === 'en') return `${count} product${count > 1 ? 's' : ''}`;
  if (count === 1) return 'منتج واحد';
  if (count === 2) return 'منتجان';
  return count <= 10 ? `${count} منتجات` : `${count} منتجًا`;
}

export default async function HomePage({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const t = copy[locale];
  const c = editorial[locale];
  const [page, categories] = await Promise.all([getProductPage({ limit: 12 }), getCategories()]);
  const featured = (['phones', 'beauty', 'kitchen'] as const).flatMap((slug) => {
    const category = categories.find((item) => item.slug === slug);
    return category ? [{ ...category, heading: c[slug] }] : [];
  });
  return (
    <SiteChrome locale={locale} pathname="/" searchParams={params}>
      <div className="home-shell">
        <section className="discovery" aria-labelledby="hero-title">
          <div className="discovery-heading">
            <div><h1 id="hero-title">{c.title}</h1><p>{c.body}</p></div>
            <Link className="section-link" href={localizedHref('/search', locale)}>{t.allOffers}<ArrowRight aria-hidden="true" size={18} /></Link>
          </div>
          <div className="discovery-tiles">
            {featured.map((category, index) => (
              <Link className={`discovery-tile discovery-tile--${category.slug} ${index === 0 ? 'discovery-tile--lead' : ''}`} href={localizedHref(`/category/${category.slug}`, locale)} key={category.slug}>
                <Image src={categoryImage(category.slug)} alt="" width={600} height={600} priority sizes={index === 0 ? '(max-width: 760px) 100vw, 45vw' : '(max-width: 760px) 50vw, 25vw'} />
                <div className="discovery-tile__copy">
                  <span>{index === 0 ? `${text(category.title, locale)} · ${productCount(category.productCount, locale)}` : productCount(category.productCount, locale)}</span>
                  <h2>{index === 0 ? category.heading : text(category.title, locale)}</h2>
                  {index === 0 && <span className="discovery-arrow"><ArrowRight aria-hidden="true" size={22} weight="bold" /></span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonForScript(websiteJsonLd(process.env['CUSTOMER_WEB_ORIGIN'] ?? '', 'atlas dz')),
          }}
        />
        <RecentStrip locale={locale} />
        <section className="home-section home-section--products" aria-labelledby="catalog-title">
          <div className="section-heading">
            <h2 id="catalog-title">{c.all} <span className="result-count">· {page.total}</span></h2>
          </div>
          {page.items.length ? <ProductGrid locale={locale} products={page.items} /> : <EmptyState locale={locale} />}
          {page.total > page.items.length && <Link className="button button--secondary catalog-more" href={localizedHref('/search', locale)}>{t.allOffers}<ArrowRight aria-hidden="true" size={18} /></Link>}
        </section>
      </div>
    </SiteChrome>
  );
}
