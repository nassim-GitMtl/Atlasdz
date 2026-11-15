import { UuidSchema } from '@atlas/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { getDeliveryFees } from '@/lib/catalog-api';

/** Public lookup used by the cart and product pages before checkout (no account needed). */
export async function GET(request: NextRequest) {
  const destinationId = UuidSchema.safeParse(request.nextUrl.searchParams.get('destinationId'));
  const sellerIds = (request.nextUrl.searchParams.get('sellerIds') ?? '').split(',').filter(Boolean);
  if (
    !destinationId.success ||
    sellerIds.length === 0 ||
    sellerIds.length > 20 ||
    !sellerIds.every((id) => UuidSchema.safeParse(id).success)
  )
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  try {
    const items = await getDeliveryFees(destinationId.data, sellerIds);
    return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
