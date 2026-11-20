import { NextResponse } from 'next/server';
import { listOfferProducts, listOffers } from '@/lib/api';
import { csvResponse } from '@/lib/csv-response';
import { accessToken } from '@/lib/session';

const dzd = (minor: number) => (minor / 100).toFixed(2);

/** The seller's offers as CSV (inventory: price, stock, status, pre-order, sale). */
export async function GET() {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const data = await Promise.all([listOffers(token), listOfferProducts(token)]).catch(() => null);
  if (!data) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const [offers, products] = data;
  const title = (id: string) => products.items.find((item) => item.id === id)?.title.fr ?? id;
  return csvResponse(
    'offres',
    [
      'offer_id',
      'product',
      'status',
      'price_dzd',
      'stock',
      'handling_days',
      'preorder_days',
      'sale_price_dzd',
      'sale_ends_at',
      'waiting_customers',
    ],
    offers.items.map((offer) => [
      offer.id,
      title(offer.productId),
      offer.status,
      dzd(offer.priceMinor),
      offer.availableQuantity,
      offer.handlingDays,
      offer.preorder ? `${offer.preorder.minDays}-${offer.preorder.maxDays}` : '',
      offer.promotion ? dzd(offer.promotion.priceMinor) : '',
      offer.promotion?.endsAt ?? '',
      offer.waitingCustomers ?? 0,
    ]),
  );
}
