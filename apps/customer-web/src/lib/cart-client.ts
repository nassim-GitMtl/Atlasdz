import { CustomerCartSchema, SessionListSchema } from '@atlas/contracts';
import { z } from 'zod';
import { customerApiOrigin } from './customer-security.ts';

export class CartApiError extends Error {
  readonly code: 'auth' | 'conflict' | 'stock' | 'limit' | 'unavailable';
  constructor(code: 'auth' | 'conflict' | 'stock' | 'limit' | 'unavailable') {
    super(code);
    this.code = code;
  }
}
async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  token?: string,
  body?: unknown,
  method?: string,
  revokingSession = false,
): Promise<T> {
  try {
    const response = await fetch(new URL(path, customerApiOrigin(process.env)), {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 401 || (!revokingSession && response.status === 403))
      throw new CartApiError('auth');
    if (!response.ok) {
      const error = z.object({ code: z.string() }).safeParse(await response.json());
      const code = error.success ? error.data.code : '';
      throw new CartApiError(
        code === 'CART_CONFLICT'
          ? 'conflict'
          : code === 'CART_OFFER_UNAVAILABLE'
            ? 'stock'
            : code === 'CART_LIMIT_REACHED'
              ? 'limit'
              : 'unavailable',
      );
    }
    return schema.parse(response.status === 204 ? undefined : await response.json());
  } catch (error) {
    if (error instanceof CartApiError) throw error;
    throw new CartApiError('unavailable');
  }
}
export const getCart = (token: string) => call('/api/v1/cart', CustomerCartSchema, token);
export const setCartItem = (
  token: string,
  offerId: string,
  quantity: number,
  expectedVersion: number,
) =>
  call(
    `/api/v1/cart/items/${encodeURIComponent(offerId)}`,
    CustomerCartSchema,
    token,
    { quantity, expectedVersion },
    'PUT',
  );
export const createCustomerSession = () =>
  call(
    '/api/v1/local/session',
    z.object({ accessToken: z.string().min(1).max(8192), expiresAt: z.iso.datetime() }).strict(),
    undefined,
    { account: 'customer' },
  );
export async function revokeCustomerSession(token: string) {
  const sessions = await call(
    '/api/v1/auth/sessions',
    SessionListSchema,
    token,
    undefined,
    'GET',
    true,
  );
  const current = sessions.sessions.filter((session) => session.current);
  if (current.length !== 1 || !current[0]) throw new CartApiError('unavailable');
  await call(
    `/api/v1/auth/sessions/${current[0].id}`,
    z.undefined(),
    token,
    undefined,
    'DELETE',
    true,
  );
}
