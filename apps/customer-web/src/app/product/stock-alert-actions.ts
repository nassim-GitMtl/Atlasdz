'use server';
import { CatalogSlugSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { customerToken } from '@/lib/cart-api';
import { customerTrustedOrigin } from '@/lib/customer-security';
import { setStockAlert, type StockAlertResult } from '@/lib/stock-alerts-api';

export interface StockAlertState {
  readonly result?: StockAlertResult | 'csrf';
  readonly waiting?: boolean;
}

/** Starts or stops waiting for a sold-out product (signed-in customers). */
export async function stockAlertAction(
  _state: StockAlertState,
  form: FormData,
): Promise<StockAlertState> {
  const h = await headers();
  if (!customerTrustedOrigin(process.env, h.get('origin'), h.get('host'))) return { result: 'csrf' };
  const token = await customerToken();
  if (!token) return { result: 'auth' };
  const slug = CatalogSlugSchema.safeParse(form.get('slug'));
  if (!slug.success) return { result: 'unavailable' };
  const waiting = form.get('waiting') === 'true';
  const result = await setStockAlert(token, slug.data, waiting);
  if (result === 'ok') revalidatePath(`/product/${slug.data}`);
  return { result, ...(result === 'ok' ? { waiting } : {}) };
}
