import { z } from 'zod';
import { customerApiOrigin } from './customer-security.ts';

export type AccountFailure =
  'auth' | 'password' | 'openOrders' | 'phoneInvalid' | 'codeInvalid' | 'limited' | 'unavailable';
export class AccountApiError extends Error {
  constructor(readonly code: AccountFailure) {
    super(code);
  }
}

async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  token: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, customerApiOrigin(process.env)), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AccountApiError('unavailable');
  }
  if (!response.ok) {
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
    const reason = error.success ? (error.data.details?.fields?.[0]?.reason ?? '') : '';
    if (code === 'INVALID_CREDENTIALS') throw new AccountApiError('password');
    if (response.status === 401 || response.status === 403) throw new AccountApiError('auth');
    if (code === 'ACCOUNT_HAS_OPEN_ORDERS') throw new AccountApiError('openOrders');
    if (code === 'RATE_LIMITED') throw new AccountApiError('limited');
    if (reason === 'PHONE_INVALID') throw new AccountApiError('phoneInvalid');
    if (reason === 'PHONE_CODE_INVALID') throw new AccountApiError('codeInvalid');
    throw new AccountApiError('unavailable');
  }
  return schema.parse(await response.json());
}

export const getAccount = (token: string) =>
  call(
    '/api/v1/account',
    z.object({ email: z.string(), locale: z.enum(['fr', 'ar']), emailVerified: z.boolean() }),
    token,
  );
export const getPhone = (token: string) =>
  call(
    '/api/v1/account/phone',
    z.object({ required: z.boolean(), phone: z.string().nullable(), verified: z.boolean() }),
    token,
  );
export const startPhone = (token: string, phone: string, locale: 'fr' | 'ar' | 'en') =>
  call('/api/v1/account/phone/start', z.object({ status: z.string() }), token, { phone, locale });
export const confirmPhone = (token: string, phone: string, code: string) =>
  call('/api/v1/account/phone/confirm', z.object({ status: z.string() }), token, { phone, code });
export const deleteAccount = (token: string, password: string) =>
  call('/api/v1/account/delete', z.object({ status: z.string() }), token, { password });
export async function exportAccount(token: string): Promise<Response> {
  return fetch(new URL('/api/v1/account/export', customerApiOrigin(process.env)), {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
}
