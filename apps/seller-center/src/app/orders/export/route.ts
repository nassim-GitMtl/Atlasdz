import { NextResponse } from 'next/server';
import { listSellerOrders } from '@/lib/api';
import { cell } from '@/lib/csv';
import { accessToken } from '@/lib/session';

/** The seller's orders as CSV (Excel/LibreOffice), for bookkeeping. */
export async function GET() {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const orders = await listSellerOrders(token)
    .then((data) => data.items)
    .catch(() => null);
  if (!orders) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const header = ['reference', 'date', 'status', 'items', 'items_dzd', 'delivery_dzd', 'total_dzd', 'recipient', 'city'];
  const lines = orders.map((o) =>
    [
      o.id,
      o.createdAt,
      o.status,
      o.snapshot.items.map((i) => `${i.title.fr} x${i.quantity}`).join('; '),
      (o.snapshot.itemsSubtotalMinor / 100).toFixed(2),
      (o.snapshot.shippingFeeMinor / 100).toFixed(2),
      (o.snapshot.totalMinor / 100).toFixed(2),
      o.deliveryContact?.recipientName ?? '',
      o.deliveryContact?.city ?? '',
    ]
      .map(cell)
      .join(','),
  );
  const csv = `\uFEFF${[header.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="commandes-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
