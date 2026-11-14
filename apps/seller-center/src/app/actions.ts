'use server';

import { UuidSchema } from '@atlas/contracts';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  approveOffer,
  createLocalSession,
  createOffer,
  updateOffer,
  revokeSellerSession,
  SellerApiError,
} from '@/lib/api';
import { href, localeFrom } from '@/lib/i18n';
import {
  parseOfferValues,
  parseOfferUpdate,
  emptyOfferValues,
  type OfferValues,
} from '@/lib/offer-input';
import { localAccountsEnabled, trustedMutationOrigin } from '@/lib/security';
import { accessToken, SESSION_COOKIE } from '@/lib/session';

export interface ActionState {
  readonly error?:
    | 'invalid'
    | 'unauthorized'
    | 'forbidden'
    | 'conflict'
    | 'unavailable'
    | 'csrf'
    | 'logoutFailure'
    | 'localDisabled';
  readonly values?: OfferValues;
}

async function validOrigin(): Promise<boolean> {
  const requestHeaders = await headers();
  return trustedMutationOrigin(
    process.env,
    requestHeaders.get('origin'),
    requestHeaders.get('host'),
  );
}

export async function loginAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const requestHeaders = await headers();
  if (!localAccountsEnabled(process.env, requestHeaders.get('host')))
    return { error: 'localDisabled' };
  if (!(await validOrigin())) return { error: 'csrf' };
  const account = form.get('account');
  if (account !== 'seller' && account !== 'admin') return { error: 'invalid' };
  try {
    const session = await createLocalSession(account);
    const expiry = new Date(session.expiresAt);
    if (expiry.getTime() <= Date.now()) return { error: 'unauthorized' };
    (await cookies()).set(SESSION_COOKIE, session.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      expires: expiry,
    });
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  redirect(
    href(account === 'admin' ? '/moderation' : '/offers', localeFrom(String(form.get('lang')))),
  );
}

export async function logoutAction(_state: ActionState, form: FormData): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (token) {
    try {
      await revokeSellerSession(token);
    } catch (error) {
      // Only a rejected credential proves the session is already unusable. A forbidden or
      // failed request must retain the cookie so the user can retry server-side revocation.
      if (!(error instanceof SellerApiError && error.code === 'unauthorized'))
        return { error: 'logoutFailure' };
    }
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect(href('/', localeFrom(String(form.get('lang')))));
}

export async function createOfferAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(
    Object.keys(emptyOfferValues).map((key) => [key, String(form.get(key) ?? '')]),
  ) as OfferValues;
  if (!(await validOrigin())) return { error: 'csrf', values };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', values };
  const parsed = parseOfferValues(values);
  if (!parsed.success) return { error: 'invalid', values };
  try {
    await createOffer(token, parsed.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', values };
  }
  revalidatePath('/offers');
  redirect(`${href('/offers', localeFrom(String(form.get('lang'))))}&created=1`);
}

export async function approveOfferAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('offerId'));
  if (!id.success) return { error: 'invalid' };
  try {
    await approveOffer(token, id.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/moderation');
  redirect(`${href('/moderation', localeFrom(String(form.get('lang'))))}&approved=1`);
}

export async function updateOfferAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(
    Object.keys(emptyOfferValues).map((key) => [key, String(form.get(key) ?? '')]),
  ) as OfferValues;
  if (!(await validOrigin())) return { error: 'csrf', values };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', values };
  const id = UuidSchema.safeParse(form.get('offerId'));
  const input = parseOfferUpdate(values, String(form.get('version') ?? ''));
  if (!id.success || !input.success) return { error: 'invalid', values };
  try {
    await updateOffer(token, id.data, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', values };
  }
  revalidatePath('/offers');
  revalidatePath(`/offers/${id.data}`);
  redirect(`${href('/offers', localeFrom(String(form.get('lang'))))}&updated=1`);
}
