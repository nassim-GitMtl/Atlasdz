import { CatalogSlugSchema } from '@atlas/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { getProduct } from '@/lib/catalog-api';

/**
 * Public product data for the slugs saved on this device (favorites, recently viewed). Nothing
 * is stored: the list stays in the browser. Products no longer on sale are left out.
 */
export async function GET(request: NextRequest) {
  const slugs = [...new Set((request.nextUrl.searchParams.get('slugs') ?? '').split(',').filter(Boolean))];
  if (slugs.length === 0) return NextResponse.json({ items: [] });
  if (slugs.length > 60 || !slugs.every((slug) => CatalogSlugSchema.safeParse(slug).success))
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const items = (await Promise.all(slugs.map((slug) => getProduct(slug).catch(() => null)))).filter(
    (item) => item !== null,
  );
  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
}
