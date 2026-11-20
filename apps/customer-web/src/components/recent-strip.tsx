'use client';
import type { CatalogProduct } from '@atlas/contracts';
import { useEffect, useState } from 'react';
import { RECENT_KEY, readList } from '@/lib/device-lists';
import { lang, type Locale } from '@/lib/i18n';
import { ProductGrid } from './product-card';

/** Products recently viewed on this device (nothing shown on a first visit). */
export function RecentStrip({ locale }: { readonly locale: Locale }) {
  const [items, setItems] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    const slugs = readList(RECENT_KEY, 4);
    if (slugs.length === 0) return;
    let alive = true;
    fetch(`/favorites/products?slugs=${slugs.map(encodeURIComponent).join(',')}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items: CatalogProduct[] }) => {
        if (alive) setItems(slugs.flatMap((slug) => data.items.filter((item) => item.slug === slug)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="recent-home-title">
      <div className="section-heading">
        <h2 id="recent-home-title">{lang(locale, 'Vus récemment', 'شوهدت مؤخرًا', 'Recently viewed')}</h2>
      </div>
      <ProductGrid locale={locale} products={items} />
    </section>
  );
}
