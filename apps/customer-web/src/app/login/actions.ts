'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  AuthApiError,
  forwardedClientIp,
  loginCustomer,
  registerCustomer,
  requestPasswordReset,
  resendVerification,
  resetPassword,
} from '@/lib/auth-client';
import type { AuthError } from '@/lib/auth-copy';
import { CUSTOMER_COOKIE } from '@/lib/cart-api';
import { customerTrustedOrigin } from '@/lib/customer-security';
import { localizedHref } from '@/lib/i18n';

export interface AuthActionState {
  readonly error?: AuthError;
  readonly done?: boolean;
}

const SAFE_NEXT = /^\/(?:cart|checkout|orders|support|notifications)(?:\/[A-Za-z0-9-]*)*$/;

function fields(form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const locale = form.get('lang') === 'ar' ? 'ar' : 'fr';
  const rawNext = String(form.get('next') ?? '');
  const next = SAFE_NEXT.test(rawNext) ? rawNext : '/cart';
  return { email, password, locale, next } as const;
}

async function trusted() {
  const h = await headers();
  return customerTrustedOrigin(process.env, h.get('origin'), h.get('host'));
}

async function clientIp() {
  return forwardedClientIp((await headers()).get('x-forwarded-for'));
}

async function startSession(email: string, password: string) {
  const session = await loginCustomer(email, password, await clientIp());
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new AuthApiError('unavailable');
  (await cookies()).set(CUSTOMER_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env['CUSTOMER_WEB_ORIGIN'] ?? '').startsWith('https:'),
    path: '/',
    expires: new Date(session.expiresAt),
  });
}

function failure(error: unknown): AuthActionState {
  return { error: error instanceof AuthApiError ? error.code : 'unavailable' };
}

export async function loginAction(_state: AuthActionState, form: FormData) {
  if (!(await trusted())) return { error: 'csrf' } satisfies AuthActionState;
  const input = fields(form);
  if (!input.email || !input.password) return { error: 'format' } satisfies AuthActionState;
  try {
    await startSession(input.email, input.password);
  } catch (error) {
    return failure(error);
  }
  redirect(localizedHref(input.next, input.locale));
}

export async function registerAction(_state: AuthActionState, form: FormData) {
  if (!(await trusted())) return { error: 'csrf' } satisfies AuthActionState;
  const input = fields(form);
  if (!input.email || !input.password) return { error: 'format' } satisfies AuthActionState;
  try {
    await registerCustomer(input.email, input.password, input.locale, await clientIp());
    await startSession(input.email, input.password);
  } catch (error) {
    return failure(error);
  }
  redirect(localizedHref(input.next, input.locale));
}

export async function forgotPasswordAction(_state: AuthActionState, form: FormData) {
  if (!(await trusted())) return { error: 'csrf' } satisfies AuthActionState;
  const { email, locale } = fields(form);
  if (!email) return { error: 'format' } satisfies AuthActionState;
  const h = await headers();
  const origin = process.env['CUSTOMER_WEB_ORIGIN'] ?? `http://${h.get('host') ?? ''}`;
  try {
    await requestPasswordReset(email, locale, origin, await clientIp());
  } catch (error) {
    return failure(error);
  }
  return { done: true } satisfies AuthActionState;
}

export async function resetPasswordAction(_state: AuthActionState, form: FormData) {
  if (!(await trusted())) return { error: 'csrf' } satisfies AuthActionState;
  const token = String(form.get('token') ?? '');
  const { password } = fields(form);
  if (!token || !password) return { error: 'format' } satisfies AuthActionState;
  try {
    await resetPassword(token, password, await clientIp());
  } catch (error) {
    return failure(error);
  }
  return { done: true } satisfies AuthActionState;
}

export async function resendVerificationAction(_state: AuthActionState, form: FormData) {
  if (!(await trusted())) return { error: 'csrf' } satisfies AuthActionState;
  const { email } = fields(form);
  if (!email) return { error: 'format' } satisfies AuthActionState;
  const h = await headers();
  const origin = process.env['CUSTOMER_WEB_ORIGIN'] ?? `http://${h.get('host') ?? ''}`;
  try {
    await resendVerification(email, origin, await clientIp());
  } catch (error) {
    return failure(error);
  }
  return { done: true } satisfies AuthActionState;
}
