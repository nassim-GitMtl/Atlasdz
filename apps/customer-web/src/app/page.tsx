import { ArrowRight, Money, Storefront, Truck } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import { ProductGrid } from '@/components/product-card';
import { SiteChrome } from '@/components/site-chrome';
import { EmptyState } from '@/components/states';
import { categoryImage } from '@/lib/catalog-view';
import { getCategories, getProductPage } from '@/lib/catalog-api';
import { copy, localizedHref, resolveLocale, text, type SearchParams } from '@/lib/i18n';

const editorial = {
  fr: { title: 'Trouvez votre prochain coup de cœur.', body: 'Les offres de vendeurs algériens, payées à la livraison.', phones: 'Smartphones et écouteurs.', beauty: 'Le rituel beauté.', kitchen: 'Le coin cuisine.', all: 'Tout le catalogue', seller: 'Chaque vendeur prépare et livre sa commande.', sellerBody: 'Plusieurs vendeurs dans un panier : une commande et une livraison par vendeur.', shipping: 'Frais fixés par le vendeur selon votre commune.', shippingBody: 'Affichés au récapitulatif, avant de confirmer.', payment: 'Paiement à la livraison.', paymentBody: 'Vous payez le vendeur ou son livreur, pas Atlas DZ.' },
  ar: { title: 'اعثر على قطعتك المفضلة التالية.', body: 'عروض لبائعين جزائريين، والدفع عند الاستلام.', phones: 'هواتف ذكية وسماعات.', beauty: 'روتين الجمال.', kitchen: 'ركن المطبخ.', all: 'كل الكتالوج', seller: 'كل بائع يحضّر ويوصل طلبه.', sellerBody: 'عدة بائعين في سلة واحدة: طلب وتوصيل مستقل لكل بائع.', shipping: 'يحدد البائع الرسوم حسب بلديتك.', shippingBody: 'تظهر في الملخص قبل تأكيد الطلب.', payment: 'الدفع عند الاستلام.', paymentBody: 'تدفع للبائع أو لمندوبه، وليس لأطلس DZ.' },
} as const;

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
  const assurances = [{ Icon: Storefront, title: c.seller, body: c.sellerBody }, { Icon: Truck, title: c.shipping, body: c.shippingBody }, { Icon: Money, title: c.payment, body: c.paymentBody }];
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
                  <span>{text(category.title, locale)}</span><h2>{category.heading}</h2>
                  {index === 0 && <span className="discovery-arrow"><ArrowRight aria-hidden="true" size={22} weight="bold" /></span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="home-section home-section--products" aria-labelledby="catalog-title">
          <div className="section-heading">
            <h2 id="catalog-title">{c.all} <span className="result-count">· {page.total}</span></h2>
            <nav className="home-category-chips" aria-label={t.categoryTitle}>
              <Link className="is-selected" href={localizedHref('/search', locale)}>{locale === 'ar' ? 'الكل' : 'Tout'}</Link>
              {categories.map((category) => <Link key={category.slug} href={localizedHref(`/category/${category.slug}`, locale)}>{text(category.title, locale)}</Link>)}
            </nav>
          </div>
          {page.items.length ? <ProductGrid locale={locale} products={page.items} /> : <EmptyState locale={locale} />}
          {page.total > page.items.length && <Link className="button button--secondary catalog-more" href={localizedHref('/search', locale)}>{t.allOffers}<ArrowRight aria-hidden="true" size={18} /></Link>}
        </section>
        <section className="trust-grid" aria-label={locale === 'ar' ? 'كيف يعمل أطلس DZ' : 'Comment fonctionne Atlas DZ'}>
          {assurances.map(({ Icon, title, body }) => <article key={title}><span><Icon aria-hidden="true" size={22} /></span><div><h2>{title}</h2><p>{body}</p></div></article>)}
        </section>
      </div>
    </SiteChrome>
  );
}
