'use server';

import { resolveLocale } from '@/lib/i18n';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { AccountApiError, confirmPhone, deleteAccount, startPhone } from '@/lib/account-api';
import { CUSTOMER_COOKIE, customerToken } from '@/lib/cart-api';
import { customerTrustedOrigin } from '@/lib/customer-security';

export interface AccountState {
  readonly error?:
    | 'auth'
    | 'passwordError'
    | 'openOrders'
    | 'phoneInvalid'
    | 'codeInvalid'
    | 'limited'
    | 'unavailable'
    | 'csrf';
  readonly step?: 'code' | 'done';
  readonly phone?: string;
}

async function guard(): Promise<string | AccountState> {
  const h = await headers();
  if (!customerTrustedOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  return (await customerToken()) ?? { error: 'auth' };
}
function failure(error: unknown): AccountState {
  if (!(error instanceof AccountApiError)) return { error: 'unavailable' };
  return { error: error.code === 'password' ? 'passwordError' : error.code };
}

export async function phoneAction(state: AccountState, form: FormData): Promise<AccountState> {
  const token = await guard();
  if (typeof token !== 'string') return token;
  const phone = String(form.get('phone') ?? '').trim();
  const code = String(form.get('code') ?? '').trim();
  try {
    if (state.step === 'code' && code) {
      await confirmPhone(token, phone, code);
      revalidatePath('/account');
      return { step: 'done' };
    }
    await startPhone(token, phone, resolveLocale(form.get('lang')));
    return { step: 'code', phone };
  } catch (error) {
    return { ...state, ...failure(error) };
  }
}

export async function deleteAccountAction(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const token = await guard();
  if (typeof token !== 'string') return token;
  try {
    await deleteAccount(token, String(form.get('password') ?? ''));
  } catch (error) {
    return failure(error);
  }
  (await cookies()).delete(CUSTOMER_COOKIE);
  return { step: 'done' };
}
