'use server';
import {
  CloseSellerOrderInputSchema,
  CreateCheckoutQuoteInputSchema,
  UuidSchema,
  WriteReviewInputSchema,
} from '@atlas/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AuthApiError, registerGuest } from '@/lib/auth-client';
import { customerToken, getCart } from '@/lib/cart-api';
import { clientIp, keepCustomerSession } from '@/lib/customer-session';
import { mergeGuestCart } from '@/lib/guest-cart';
import { customerCheckoutEnabled, customerTrustedOrigin } from '@/lib/customer-security';
import {
  cancelOrder,
  confirmDelivery,
  createQuote,
  OrderApiError,
  placeOrder,
  type OrderFailure,
} from '@/lib/orders-api';
import { localizedHref, resolveLocale } from '@/lib/i18n';
import { ReviewApiError, writeReview, type ReviewFailure } from '@/lib/reviews-api';

export interface OrderActionState {
  readonly error?: OrderFailure | 'invalid' | 'csrf' | 'exists' | 'limited';
  readonly cancelled?: boolean;
  readonly confirmed?: boolean;
}
export async function confirmDeliveryAction(
  _state: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  if (!(await authorized())) return { error: 'csrf' };
  const token = await customerToken();
  if (!token) return { error: 'auth' };
  const id = UuidSchema.safeParse(form.get('sellerOrderId'));
  const input = CloseSellerOrderInputSchema.safeParse({
    expectedVersion: Number(form.get('version')),
  });
  if (!id.success || !input.success || form.get('confirmReceipt') !== 'yes')
    return { error: 'invalid' };
  try {
    const order = await confirmDelivery(token, id.data, input.data.expectedVersion);
    revalidatePath(`/orders/${order.orderId}`);
    revalidatePath('/orders');
    return { confirmed: true };
  } catch (error) {
    return failure(error);
  }
}
async function authorized() {
  const h = await headers();
  return (
    customerTrustedOrigin(process.env, h.get('origin'), h.get('host')) &&
    customerCheckoutEnabled(process.env, h.get('host'))
  );
}
const failure = (error: unknown): OrderActionState => ({
  error: error instanceof OrderApiError ? error.code : 'unavailable',
});
export async function quoteAction(
  _state: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  if (!(await authorized())) return { error: 'csrf' };
  const lang = resolveLocale(form.get('lang'));
  let token = await customerToken();
  const input = CreateCheckoutQuoteInputSchema.safeParse({
    // Guests have no account cart yet: the real version is read once it exists.
    expectedCartVersion: token ? Number(form.get('version')) : 1,
    destinationId: form.get('destinationId'),
    deliveryContact: {
      recipientName: form.get('recipientName'),
      phone: form.get('phone'),
      addressLine: form.get('addressLine'),
      city: form.get('city'),
      // Optional: an empty field is simply left out.
      ...(String(form.get('note') ?? '').trim() ? { note: form.get('note') } : {}),
    },
  });
  if (!input.success) return { error: 'invalid' };
  let expectedCartVersion = input.data.expectedCartVersion;
  if (!token) {
    // Checkout without an account: the email comes with the delivery details. The account is
    // created now (a set-password link is emailed) and the cookie cart moves into it.
    const email = String(form.get('email') ?? '').trim();
    if (!email) return { error: 'invalid' };
    try {
      token = await keepCustomerSession(await registerGuest(email, lang, await clientIp()));
      await mergeGuestCart(token);
      expectedCartVersion = (await getCart(token)).version;
    } catch (error) {
      if (error instanceof AuthApiError && (error.code === 'exists' || error.code === 'limited'))
        return { error: error.code };
      if (error instanceof AuthApiError && error.code === 'format') return { error: 'invalid' };
      return { error: 'unavailable' };
    }
  }
  let id: string;
  try {
    id = (
      await createQuote(
        token,
        expectedCartVersion,
        input.data.destinationId,
        input.data.deliveryContact,
        form.get('acceptPreorder') === 'yes',
      )
    ).id;
  } catch (error) {
    return failure(error);
  }
  redirect(localizedHref(`/checkout/${id}`, lang));
}
export async function placeAction(
  _state: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  if (!(await authorized())) return { error: 'csrf' };
  const token = await customerToken();
  if (!token) return { error: 'auth' };
  const id = UuidSchema.safeParse(form.get('quoteId'));
  if (!id.success) return { error: 'invalid' };
  if (process.env['ATLAS_LIVE_CHECKOUT'] === 'true' && form.get('acceptTerms') !== 'yes')
    return { error: 'terms' };
  let orderId: string;
  try {
    orderId = (await placeOrder(token, id.data)).id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath('/cart');
  revalidatePath('/orders');
  redirect(
    `${localizedHref(`/orders/${orderId}`, resolveLocale(form.get('lang')))}&placed=1`,
  );
}
export async function cancelAction(
  _state: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  if (!(await authorized())) return { error: 'csrf' };
  const token = await customerToken();
  if (!token) return { error: 'auth' };
  const id = UuidSchema.safeParse(form.get('sellerOrderId'));
  const input = CloseSellerOrderInputSchema.safeParse({
    expectedVersion: Number(form.get('version')),
  });
  if (!id.success || !input.success) return { error: 'invalid' };
  try {
    const order = await cancelOrder(token, id.data, input.data.expectedVersion);
    revalidatePath(`/orders/${order.orderId}`);
    revalidatePath('/orders');
    return { cancelled: true };
  } catch (error) {
    return failure(error);
  }
}

export interface ReviewActionState {
  readonly error?: ReviewFailure | 'csrf';
  readonly saved?: boolean;
}

/** The buyer rates a delivered item (or edits that rating) from the order page. */
export async function reviewAction(
  _state: ReviewActionState,
  form: FormData,
): Promise<ReviewActionState> {
  if (!(await authorized())) return { error: 'csrf' };
  const token = await customerToken();
  if (!token) return { error: 'auth' };
  const orderId = UuidSchema.safeParse(form.get('orderId'));
  const sellerOrderId = UuidSchema.safeParse(form.get('sellerOrderId'));
  const productId = UuidSchema.safeParse(form.get('productId'));
  const comment = String(form.get('comment') ?? '').trim();
  const input = WriteReviewInputSchema.safeParse({
    rating: Number(form.get('rating')),
    body: comment === '' ? null : comment,
    expectedVersion: Number(form.get('version') ?? 0),
  });
  if (!orderId.success || !sellerOrderId.success || !productId.success || !input.success)
    return { error: 'invalid' };
  try {
    await writeReview(token, sellerOrderId.data, productId.data, input.data);
    revalidatePath(`/orders/${orderId.data}`);
    return { saved: true };
  } catch (error) {
    return { error: error instanceof ReviewApiError ? error.code : 'unavailable' };
  }
}
