import { exportAccount } from '@/lib/account-api';
import { customerToken } from '@/lib/cart-api';

/** Downloads the signed-in customer's data as a JSON attachment. */
export async function GET() {
  const token = await customerToken();
  if (!token) return new Response(null, { status: 401 });
  const upstream = await exportAccount(token).catch(() => null);
  if (!upstream?.ok) return new Response(null, { status: upstream?.status === 401 ? 401 : 502 });
  return new Response(upstream.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="atlas-dz-mes-donnees.json"',
      'cache-control': 'no-store',
    },
  });
}
