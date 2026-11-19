import { StockAlertListSchema, StockAlertStatusSchema } from '@atlas/contracts';
import { customerApiOrigin } from './customer-security.ts';

export type StockAlertResult = 'ok' | 'inStock' | 'auth' | 'unavailable';

async function call(path: string, token: string, method: 'GET' | 'POST' | 'DELETE') {
  return fetch(new URL(path, customerApiOrigin(process.env)), {
    method,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
}

/** Whether the customer waits for this product; null when it cannot be known. */
export async function stockAlertWaiting(token: string, slug: string): Promise<boolean | null> {
  try {
    const response = await call(`/api/v1/stock-alerts/${encodeURIComponent(slug)}`, token, 'GET');
    if (!response.ok) return null;
    return StockAlertStatusSchema.parse(await response.json()).waiting;
  } catch {
    return null;
  }
}

export async function setStockAlert(
  token: string,
  slug: string,
  waiting: boolean,
): Promise<StockAlertResult> {
  try {
    const response = await call(
      `/api/v1/stock-alerts/${encodeURIComponent(slug)}`,
      token,
      waiting ? 'POST' : 'DELETE',
    );
    if (response.ok) return 'ok';
    if (response.status === 401 || response.status === 403) return 'auth';
    if (response.status === 409) return 'inStock';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function listStockAlerts(token: string) {
  const response = await call('/api/v1/stock-alerts', token, 'GET');
  if (!response.ok) throw new Error('STOCK_ALERTS_UNAVAILABLE');
  return StockAlertListSchema.parse(await response.json()).items;
}
