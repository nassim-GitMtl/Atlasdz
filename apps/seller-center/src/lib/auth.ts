import { SellerLegalSchema, type SellerLegal } from '@atlas/contracts';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { AuthError } from './auth-copy.ts';
import { apiOrigin } from './security.ts';

export class AuthApiError extends Error {
  readonly code: AuthError | 'unauthorized' | 'forbidden' | 'conflict';
  constructor(code: AuthApiError['code']) {
    super(code);
    this.code = code;
  }
}

export const LoginResponseSchema = z.discriminatedUnion('status', [
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
      secret: z.string().regex(/^[A-Z2-7]{16,64}$/),
      otpauthUri: z.string().startsWith('otpauth://totp/'),
    })
    .strict(),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

const SellerApplicationSchema = z
  .object({
    sellerId: z.uuid(),
    slug: z.string(),
    name: z.string(),
    descriptionFr: z.string(),
    descriptionAr: z.string(),
    email: z.string(),
    createdAt: z.iso.datetime(),
    legal: SellerLegalSchema.nullable().optional(),
  })
  .strict();
export type SellerApplication = z.infer<typeof SellerApplicationSchema>;

async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { token?: string; body?: unknown; clientIp?: string | undefined } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, apiOrigin(process.env)), {
      method: options.body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.clientIp ? { 'x-forwarded-for': options.clientIp } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new AuthApiError('unavailable');
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
    const fields = error.success ? (error.data.details?.fields ?? []) : [];
    if (code === 'INVALID_CREDENTIALS') throw new AuthApiError('invalid');
    if (code === 'ACCOUNT_CONFLICT') throw new AuthApiError('exists');
    if (code === 'RATE_LIMITED') throw new AuthApiError('limited');
    if (code === 'VALIDATION_FAILED') {
      if (fields.some((field) => field.reason === 'RESET_TOKEN_INVALID'))
        throw new AuthApiError('resetInvalid');
      throw new AuthApiError(
        fields.some((field) => field.reason.startsWith('PASSWORD_')) ? 'weak' : 'format',
      );
    }
    if (response.status === 401) throw new AuthApiError('unauthorized');
    if (response.status === 403) throw new AuthApiError('forbidden');
    if (response.status === 404 || response.status === 409) throw new AuthApiError('conflict');
    throw new AuthApiError('unavailable');
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new AuthApiError('unavailable');
  return parsed.data;
}

export const login = (email: string, password: string, totpCode?: string, clientIp?: string) =>
  call('/api/v1/auth/login', LoginResponseSchema, {
    body: { email, password, ...(totpCode ? { totpCode } : {}) },
    clientIp,
  });

export const registerSeller = (
  input: {
    email: string;
    password: string;
    locale: 'fr' | 'ar' | 'en';
    storeName: string;
    descriptionFr: string;
    descriptionAr: string;
    legal: SellerLegal;
  },
  clientIp?: string,
) =>
  call('/api/v1/auth/register/seller', z.object({ status: z.literal('CREATED') }), {
    body: { ...input, origin: process.env['SELLER_WEB_ORIGIN'] },
    clientIp,
  });

export const sellerAccount = (token: string) =>
  call(
    '/api/v1/seller/account',
    z.object({
      sellerId: z.uuid(),
      status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']),
      /** End of the holiday while the shop is closed; null when open. */
      holidayUntil: z.string().nullable().optional(),
      legal: SellerLegalSchema.nullable().optional(),
    }),
    { token },
  );
/** Updates the legal identity shown to buyers. */
export const setSellerLegal = (token: string, legal: SellerLegal) =>
  call('/api/v1/seller/account/legal', z.object({ legal: SellerLegalSchema }), {
    token,
    body: legal,
  });
/** Holiday mode: hide every offer until `until` (ISO), or reopen now with null. */
export const setSellerHoliday = (token: string, until: string | null) =>
  call('/api/v1/seller/account/holiday', z.object({ holidayUntil: z.string().nullable() }), {
    token,
    body: { until },
  });

export const listSellerApplications = (token: string) =>
  call(
    '/api/v1/admin/sellers',
    z.object({ items: SellerApplicationSchema.array().max(100) }).strict(),
    { token },
  );

export const reviewSeller = (
  token: string,
  sellerId: string,
  decision: 'APPROVE' | 'REJECT',
  reason?: string,
) =>
  call(
    `/api/v1/admin/sellers/${encodeURIComponent(sellerId)}/review`,
    z.object({ sellerId: z.uuid(), status: z.enum(['APPROVED', 'REJECTED']) }),
    { token, body: { decision, ...(reason ? { reason } : {}) } },
  );

/** First X-Forwarded-For hop set by the TLS proxy; forwarded so the API can throttle per client. */
export function forwardedClientIp(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first && isIP(first) ? first : undefined;
}

const Accepted = z.object({ status: z.string() });
export const requestPasswordReset = (
  email: string,
  locale: 'fr' | 'ar' | 'en',
  origin: string,
  clientIp?: string,
) => call('/api/v1/auth/password/forgot', Accepted, { body: { email, locale, origin }, clientIp });
export const resetPassword = (token: string, password: string, clientIp?: string) =>
  call('/api/v1/auth/password/reset', Accepted, { body: { token, password }, clientIp });

/** Uploads the cover photo, or an extra photo with `target: 'gallery'`. */
export async function uploadProductPhoto(
  token: string,
  productId: string,
  bytes: ArrayBuffer,
  contentType: string,
  target: 'image' | 'gallery' = 'image',
): Promise<'ok' | 'invalid' | 'forbidden' | 'full' | 'unavailable'> {
  try {
    const response = await fetch(
      new URL(
        `/api/v1/seller/products/${encodeURIComponent(productId)}/${target}`,
        apiOrigin(process.env),
      ),
      {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        body: bytes,
      },
    );
    if (response.ok) return 'ok';
    if (response.status === 409) return 'full';
    if ([413, 415, 422].includes(response.status)) return 'invalid';
    if ([401, 403, 404].includes(response.status)) return 'forbidden';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export const verifyEmail = (token: string) =>
  call('/api/v1/auth/email/verify', z.object({ status: z.literal('VERIFIED') }), {
    body: { token },
  });

const CustomerSignalSchema = z.object({
  phoneVerified: z.boolean(),
  /** False for guest orders until the buyer opens the emailed link. */
  emailVerified: z.boolean().optional(),
  deliveryPhoneVerified: z.boolean(),
  deliveredOrders: z.number().int(),
  failedDeliveries: z.number().int(),
  cancelledOrders: z.number().int(),
  accountAgeDays: z.number().int(),
});
export type CustomerSignal = z.infer<typeof CustomerSignalSchema>;
export const customerSignal = (token: string, sellerOrderId: string) =>
  call(
    `/api/v1/seller/orders/${encodeURIComponent(sellerOrderId)}/customer-signal`,
    CustomerSignalSchema,
    { token },
  ).catch(() => null);

/** Removes an extra photo, or makes it the cover photo. */
export async function changeGalleryPhoto(
  token: string,
  productId: string,
  mediaId: string,
  change: 'remove' | 'cover',
): Promise<boolean> {
  try {
    const response = await fetch(
      new URL(
        `/api/v1/seller/products/${encodeURIComponent(productId)}/gallery/${encodeURIComponent(mediaId)}/${change}`,
        apiOrigin(process.env),
      ),
      {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function removeProductPhoto(token: string, productId: string): Promise<boolean> {
  try {
    const response = await fetch(
      new URL(
        `/api/v1/seller/products/${encodeURIComponent(productId)}/image/remove`,
        apiOrigin(process.env),
      ),
      {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
