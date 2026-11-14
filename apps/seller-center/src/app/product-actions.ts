'use server';
import { UuidSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { SellerApiError, submitProduct, reviewProduct } from '@/lib/api';
import {
  parseProductValues,
  parseProductReview,
  emptyProductValues,
  type ProductValues,
} from '@/lib/product-input';
import { trustedMutationOrigin } from '@/lib/security';
import { accessToken } from '@/lib/session';
import { href, localeFrom } from '@/lib/i18n';
import type { ActionState } from './actions';

export interface ProductActionState {
  readonly error?: ActionState['error'];
  readonly values?: ProductValues;
  readonly reason?: string;
}
async function originAllowed() {
  const h = await headers();
  return trustedMutationOrigin(process.env, h.get('origin'), h.get('host'));
}
export async function submitProductAction(
  _state: ProductActionState,
  form: FormData,
): Promise<ProductActionState> {
  const values = Object.fromEntries(
    Object.keys(emptyProductValues).map((key) => [key, String(form.get(key) ?? '')]),
  ) as ProductValues;
  if (!(await originAllowed())) return { error: 'csrf', values };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', values };
  const parsed = parseProductValues(values);
  if (!parsed.success) return { error: 'invalid', values };
  try {
    await submitProduct(token, parsed.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', values };
  }
  revalidatePath('/products');
  revalidatePath('/moderation/products');
  redirect(`${href('/products', localeFrom(String(form.get('lang'))))}&submitted=1`);
}
export async function reviewProductAction(
  _state: ProductActionState,
  form: FormData,
): Promise<ProductActionState> {
  const reason = String(form.get('reason') ?? '');
  if (!(await originAllowed())) return { error: 'csrf', reason };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', reason };
  const input = parseProductReview(form);
  const id = UuidSchema.safeParse(form.get('id'));
  if (!input.success || !id.success) return { error: 'invalid', reason };
  try {
    await reviewProduct(token, id.data, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', reason };
  }
  revalidatePath('/moderation/products');
  revalidatePath('/products');
  revalidatePath('/offers/new');
  redirect(`${href('/moderation/products', localeFrom(String(form.get('lang'))))}&reviewed=1`);
}
