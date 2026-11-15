import { isIP } from 'node:net';
import { z } from 'zod';
import type { AuthError } from './auth-copy.ts';
import { customerApiOrigin } from './customer-security.ts';

export class AuthApiError extends Error {
  readonly code: AuthError;
  constructor(code: AuthError) {
    super(code);
    this.code = code;
  }
}

const LoginResponse = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('AUTHENTICATED'),
      accessToken: z.string().min(1).max(8192),
      expiresAt: z.iso.datetime(),
      actorType: z.enum(['customer', 'seller_user', 'staff']),
    })
    .strict(),
  z.object({ status: z.literal('MFA_REQUIRED') }).strict(),
  z
    .object({
      status: z.literal('MFA_ENROLLMENT_REQUIRED'),
      secret: z.string(),
      otpauthUri: z.string(),
    })
    .strict(),
]);

async function post(path: string, body: unknown, clientIp?: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(path, customerApiOrigin(process.env)), {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError('unavailable');
  }
  if (response.ok) return response.json();
  const error = z
    .object({
      code: z.string(),
      details: z
        .object({ fields: z.array(z.object({ path: z.string(), reason: z.string() })) })
        .partial()
        .optional(),
    })
    .safeParse(await response.json().catch(() => null));
  const code = error.success ? error.data.code : '';
  if (code === 'INVALID_CREDENTIALS') throw new AuthApiError('invalid');
  if (code === 'ACCOUNT_CONFLICT') throw new AuthApiError('exists');
  if (code === 'RATE_LIMITED') throw new AuthApiError('limited');
  if (code === 'VALIDATION_FAILED') {
    if (
      error.success &&
      (error.data.details?.fields ?? []).some((field) => field.reason === 'RESET_TOKEN_INVALID')
    )
      throw new AuthApiError('resetInvalid');
    const passwordPolicy = error.success
      ? (error.data.details?.fields ?? []).some((field) => field.reason.startsWith('PASSWORD_'))
      : false;
    throw new AuthApiError(passwordPolicy ? 'weak' : 'format');
  }
  throw new AuthApiError('unavailable');
}

export async function loginCustomer(email: string, password: string, clientIp?: string) {
  const result = LoginResponse.safeParse(
    await post('/api/v1/auth/login', { email, password }, clientIp),
  );
  if (!result.success) throw new AuthApiError('unavailable');
  if (result.data.status !== 'AUTHENTICATED' || result.data.actorType !== 'customer') {
    throw new AuthApiError('seller');
  }
  return result.data;
}

export async function registerCustomer(
  email: string,
  password: string,
  locale: 'fr' | 'ar' | 'en',
  clientIp?: string,
) {
  await post(
    '/api/v1/auth/register/customer',
    { email, password, locale, origin: process.env['CUSTOMER_WEB_ORIGIN'] },
    clientIp,
  );
}

/** Guest checkout: the API creates the account, signs it in and emails a set-password link. */
export async function registerGuest(email: string, locale: 'fr' | 'ar' | 'en', clientIp?: string) {
  const result = LoginResponse.safeParse(
    await post(
      '/api/v1/auth/register/guest',
      { email, locale, origin: process.env['CUSTOMER_WEB_ORIGIN'] },
      clientIp,
    ),
  );
  if (!result.success || result.data.status !== 'AUTHENTICATED') {
    throw new AuthApiError('unavailable');
  }
  return result.data;
}

/** First X-Forwarded-For hop set by the TLS proxy; forwarded so the API can throttle per client. */
export function forwardedClientIp(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first && isIP(first) ? first : undefined;
}

export async function requestPasswordReset(
  email: string,
  locale: 'fr' | 'ar' | 'en',
  origin: string,
  clientIp?: string,
) {
  await post('/api/v1/auth/password/forgot', { email, locale, origin }, clientIp);
}

export async function resetPassword(token: string, password: string, clientIp?: string) {
  await post('/api/v1/auth/password/reset', { token, password }, clientIp);
}

export async function verifyEmail(token: string): Promise<boolean> {
  try {
    await post('/api/v1/auth/email/verify', { token });
    return true;
  } catch (error) {
    if (error instanceof AuthApiError && error.code !== 'unavailable') return false;
    throw error;
  }
}

export async function resendVerification(email: string, origin: string, clientIp?: string) {
  await post('/api/v1/auth/email/resend', { email, origin }, clientIp);
}
