'use server';
import { AskQuestionInputSchema, CatalogSlugSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { customerToken } from '@/lib/cart-api';
import { customerApiOrigin, customerTrustedOrigin } from '@/lib/customer-security';

export interface QuestionState {
  readonly result?: 'sent' | 'invalid' | 'auth' | 'limit' | 'csrf' | 'unavailable';
}

/** Sends a signed-in customer's question about a product (shown without their name). */
export async function askQuestionAction(_state: QuestionState, form: FormData): Promise<QuestionState> {
  const h = await headers();
  if (!customerTrustedOrigin(process.env, h.get('origin'), h.get('host'))) return { result: 'csrf' };
  const token = await customerToken();
  if (!token) return { result: 'auth' };
  const slug = CatalogSlugSchema.safeParse(form.get('slug'));
  const input = AskQuestionInputSchema.safeParse({ body: form.get('body') });
  if (!slug.success || !input.success) return { result: 'invalid' };
  try {
    const response = await fetch(
      new URL(`/api/v1/catalog/products/${encodeURIComponent(slug.data)}/questions`, customerApiOrigin(process.env)),
      {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input.data),
      },
    );
    if (response.status === 401 || response.status === 403) return { result: 'auth' };
    if (response.status === 429) return { result: 'limit' };
    if (!response.ok) return { result: response.status === 422 ? 'invalid' : 'unavailable' };
  } catch {
    return { result: 'unavailable' };
  }
  revalidatePath(`/product/${slug.data}`);
  return { result: 'sent' };
}
