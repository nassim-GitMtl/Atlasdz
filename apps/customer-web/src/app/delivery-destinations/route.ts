import { NextResponse } from 'next/server';
import { getDestinations } from '@/lib/catalog-api';

/** Communes and wilayas for the product page's delivery estimate, loaded only on demand. */
export async function GET() {
  try {
    const items = (await getDestinations())
      .filter((d) => d.kind !== 'WILAYA')
      .map((d) => ({
      id: d.id,
      name: d.name,
      wilaya: d.wilaya ? { id: d.wilaya.id, code: d.wilaya.code, name: d.wilaya.name } : null,
    }));
    return NextResponse.json({ items }, { headers: { 'cache-control': 'public, max-age=3600' } });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
