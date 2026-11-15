'use server';

import { UuidSchema } from '@atlas/contracts';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  CartApiError,
  createCustomerSession,
  CUSTOMER_COOKIE,
  customerToken,
  getCart,
  revokeCustomerSession,
  setCartItem,
} from '@/lib/cart-api';
import { customerLocalEnabled, customerTrustedOrigin } from '@/lib/customer-security';
import { readGuestCart, withLine, writeGuestCart } from '@/lib/guest-cart';
import { CatalogSlugSchema } from '@atlas/contracts';
import { localizedHref } from '@/lib/i18n';

export interface CartActionState {
  readonly error?:
    'auth' | 'conflict' | 'stock' | 'limit' | 'unavailable' | 'invalid' | 'csrf' | 'logoutFailure';
  readonly added?: boolean;
}
const locale = (form: FormData) => (form.get('lang') === 'ar' ? 'ar' : 'fr');
async function trusted() {
  const h = await headers();
  return customerTrustedOrigin(process.env, h.get('origin'), h.get('host'));
}
const failure = (error: unknown): CartActionState => ({
  error: error instanceof CartApiError ? error.code : 'unavailable',
});
export async function addCartAction(
  _state: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  if (!(await trusted())) return { error: 'csrf' };
  const token = await customerToken();
  const id = UuidSchema.safeParse(form.get('offerId'));
  if (!id.success) return { error: 'invalid' };
  if (!token) {
    // No account needed to shop: the cart stays in a cookie until checkout or sign-in.
    const slug = CatalogSlugSchema.safeParse(form.get('productSlug'));
    if (!slug.success) return { error: 'invalid' };
    const lines = await readGuestCart();
    const quantity = (lines.find((line) => line.offerId === id.data)?.quantity ?? 0) + 1;
    if (quantity > 99) return { error: 'invalid' };
    const next = withLine(lines, { offerId: id.data, slug: slug.data, quantity });
    if (next === null) return { error: 'limit' };
    await writeGuestCart(next);
    revalidatePath('/cart');
    return { added: true };
  }
  try {
    const cart = await getCart(token);
    const quantity = (cart.items.find((item) => item.offerId === id.data)?.quantity ?? 0) + 1;
    if (quantity > 99) return { error: 'invalid' };
    await setCartItem(token, id.data, quantity, cart.version);
    revalidatePath('/cart');
    return { added: true };
  } catch (error) {
    return failure(error);
  }
}
export async function updateCartAction(
  _state: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  if (!(await trusted())) return { error: 'csrf' };
  const token = await customerToken();
  const id = UuidSchema.safeParse(form.get('offerId'));
  const rawQuantity = form.get('remove') === '1' ? '0' : String(form.get('quantity') ?? '');
  const rawVersion = String(form.get('version') ?? '');
  if (
    !id.success ||
    !/^(?:0|[1-9]\d?)$/.test(rawQuantity) ||
    !/^(?:0|[1-9]\d{0,9})$/.test(rawVersion)
  )
    return { error: 'invalid' };
  if (!token) {
    const lines = await readGuestCart();
    const current = lines.find((line) => line.offerId === id.data);
    if (!current) return { error: 'invalid' };
    const quantity = Number(rawQuantity);
    await writeGuestCart(
      withLine(
        lines,
        quantity === 0 ? { offerId: id.data, quantity: 0 } : { ...current, quantity },
      ) ?? lines,
    );
    revalidatePath('/cart');
    return {};
  }
  try {
    await setCartItem(token, id.data, Number(rawQuantity), Number(rawVersion));
    revalidatePath('/cart');
    return {};
  } catch (error) {
    return failure(error);
  }
}
export async function customerLoginAction(
  _state: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  if (!(await trusted())) return { error: 'csrf' };
  if (!customerLocalEnabled(process.env, (await headers()).get('host'))) return { error: 'auth' };
  try {
    const issued = await createCustomerSession();
    if (new Date(issued.expiresAt).getTime() <= Date.now()) return { error: 'auth' };
    (await cookies()).set(CUSTOMER_COOKIE, issued.accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/',
      expires: new Date(issued.expiresAt),
    });
  } catch (error) {
    return failure(error);
  }
  redirect(localizedHref('/cart', locale(form)));
}
export async function customerLogoutAction(
  _state: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  if (!(await trusted())) return { error: 'csrf' };
  const token = await customerToken();
  if (token) {
    try {
      await revokeCustomerSession(token);
    } catch (error) {
      if (!(error instanceof CartApiError && error.code === 'auth'))
        return { error: 'logoutFailure' };
    }
  }
  (await cookies()).delete(CUSTOMER_COOKIE);
  redirect(localizedHref('/cart', locale(form)));
}
