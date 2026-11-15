'use server';

import { UuidSchema } from '@atlas/contracts';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  AuthApiError,
  forwardedClientIp,
  login,
  registerSeller,
  requestPasswordReset,
  resetPassword,
  reviewSeller,
  removeProductPhoto,
  uploadProductPhoto,
} from '@/lib/auth';
import type { AuthError } from '@/lib/auth-copy';
import { href, localeFrom } from '@/lib/i18n';
import { trustedMutationOrigin } from '@/lib/security';
import { accessToken, KIND_COOKIE, SESSION_COOKIE } from '@/lib/session';

export interface LoginState {
  readonly error?: AuthError;
  readonly step?: 'password' | 'code' | 'enroll';
  readonly secret?: string;
  readonly otpauthUri?: string;
}
export interface RegisterState {
  readonly error?: AuthError;
  readonly done?: boolean;
}
export interface ReviewState {
  readonly error?: 'invalid' | 'unauthorized' | 'forbidden' | 'conflict' | 'unavailable' | 'csrf';
}

async function validOrigin(): Promise<boolean> {
  const h = await headers();
  return trustedMutationOrigin(process.env, h.get('origin'), h.get('host'));
}

const str = (form: FormData, key: string) => String(form.get(key) ?? '');

function authFailure(error: unknown): AuthError {
  if (!(error instanceof AuthApiError)) return 'unavailable';
  const code = error.code;
  return code === 'unauthorized' || code === 'forbidden' || code === 'conflict' ? 'invalid' : code;
}

export async function sellerLoginAction(state: LoginState, form: FormData): Promise<LoginState> {
  if (!(await validOrigin())) return { ...state, error: 'csrf' };
  const locale = localeFrom(str(form, 'lang'));
  const email = str(form, 'email').trim();
  const password = str(form, 'password');
  const code = str(form, 'code').replace(/\s+/g, '');
  if (!email || !password || (code !== '' && !/^[0-9]{6}$/.test(code))) {
    return { ...state, error: 'format' };
  }
  let destination: string;
  try {
    const ip = forwardedClientIp((await headers()).get('x-forwarded-for'));
    const result = await login(email, password, code || undefined, ip);
    if (result.status === 'MFA_REQUIRED') return { step: 'code' };
    if (result.status === 'MFA_ENROLLMENT_REQUIRED') {
      return { step: 'enroll', secret: result.secret, otpauthUri: result.otpauthUri };
    }
    if (result.actorType === 'customer') return { error: 'customer' };
    const expires = new Date(result.expiresAt);
    if (expires.getTime() <= Date.now()) return { ...state, error: 'unavailable' };
    const options = {
      httpOnly: true,
      secure: (process.env['SELLER_WEB_ORIGIN'] ?? '').startsWith('https:'),
      sameSite: 'strict',
      path: '/',
      expires,
    } as const;
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.accessToken, options);
    jar.set(KIND_COOKIE, result.actorType === 'staff' ? 'staff' : 'seller', options);
    destination = result.actorType === 'staff' ? '/moderation/sellers' : '/account';
  } catch (error) {
    return { ...state, error: authFailure(error) };
  }
  redirect(href(destination, locale));
}

export async function sellerRegisterAction(
  _state: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const locale = localeFrom(str(form, 'lang'));
  const input = {
    email: str(form, 'email').trim(),
    password: str(form, 'password'),
    locale,
    storeName: str(form, 'storeName').trim(),
    descriptionFr: str(form, 'descriptionFr').trim(),
    descriptionAr: str(form, 'descriptionAr').trim(),
  };
  if (Object.values(input).some((value) => value === '')) return { error: 'format' };
  try {
    await registerSeller(input, forwardedClientIp((await headers()).get('x-forwarded-for')));
  } catch (error) {
    return { error: authFailure(error) };
  }
  redirect(`${href('/login', locale)}&registered=1`);
}

export async function reviewSellerAction(
  _state: ReviewState,
  form: FormData,
): Promise<ReviewState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const sellerId = UuidSchema.safeParse(form.get('sellerId'));
  const decision = form.get('decision');
  const reason = str(form, 'reason').trim();
  if (
    !sellerId.success ||
    (decision !== 'APPROVE' && decision !== 'REJECT') ||
    (decision === 'REJECT' && (reason.length < 1 || reason.length > 1000))
  ) {
    return { error: 'invalid' };
  }
  try {
    await reviewSeller(token, sellerId.data, decision, decision === 'REJECT' ? reason : undefined);
  } catch (error) {
    const code = error instanceof AuthApiError ? error.code : 'unavailable';
    return {
      error:
        code === 'unauthorized' || code === 'forbidden' || code === 'conflict'
          ? code
          : 'unavailable',
    };
  }
  revalidatePath('/moderation/sellers');
  redirect(`${href('/moderation/sellers', localeFrom(str(form, 'lang')))}&reviewed=1`);
}

export async function forgotPasswordAction(
  _state: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const email = str(form, 'email').trim();
  if (!email) return { error: 'format' };
  const h = await headers();
  const origin = process.env['SELLER_WEB_ORIGIN'] ?? `http://${h.get('host') ?? ''}`;
  try {
    await requestPasswordReset(
      email,
      localeFrom(str(form, 'lang')),
      origin,
      forwardedClientIp(h.get('x-forwarded-for')),
    );
  } catch (error) {
    return { error: authFailure(error) };
  }
  return { done: true };
}

export async function resetPasswordAction(
  _state: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = str(form, 'token');
  const password = str(form, 'password');
  if (!token || !password) return { error: 'format' };
  try {
    await resetPassword(
      token,
      password,
      forwardedClientIp((await headers()).get('x-forwarded-for')),
    );
  } catch (error) {
    return { error: authFailure(error) };
  }
  return { done: true };
}

export interface PhotoState {
  readonly error?: 'invalid' | 'forbidden' | 'unavailable' | 'csrf' | 'unauthorized';
  readonly done?: boolean;
}

export async function uploadPhotoAction(_state: PhotoState, form: FormData): Promise<PhotoState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const productId = UuidSchema.safeParse(form.get('productId'));
  const file = form.get('photo');
  if (
    !productId.success ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    return { error: 'invalid' };
  const result = await uploadProductPhoto(
    token,
    productId.data,
    await file.arrayBuffer(),
    file.type,
  );
  if (result !== 'ok') return { error: result };
  revalidatePath('/products');
  return { done: true };
}

export async function removePhotoAction(_state: PhotoState, form: FormData): Promise<PhotoState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const productId = UuidSchema.safeParse(form.get('productId'));
  if (!productId.success) return { error: 'invalid' };
  if (!(await removeProductPhoto(token, productId.data))) return { error: 'forbidden' };
  revalidatePath('/products');
  return { done: true };
}
