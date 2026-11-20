import { NextResponse, type NextRequest } from 'next/server';
import { getProductPage } from '@/lib/catalog-api';
import { resolveLocale, text } from '@/lib/i18n';

/** Up to six products matching what the shopper is typing (title, slug, lowest price). */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const locale = resolveLocale(request.nextUrl.searchParams.get('lang') ?? undefined);
  if (query.length < 2 || query.length > 60) return NextResponse.json({ items: [] });
  try {
    const page = await getProductPage({ query, limit: 6 });
    const items = page.items.map((product) => ({
      slug: product.slug,
      title: text(product.title, locale),
      priceMinor: Math.min(...product.offers.map((offer) => offer.priceMinor)),
    }));
    return NextResponse.json(
      { items },
      { headers: { 'cache-control': 'public, max-age=30' } },
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
