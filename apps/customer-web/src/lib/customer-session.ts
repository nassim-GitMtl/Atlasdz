import { cookies, headers } from 'next/headers';
import { AuthApiError, forwardedClientIp } from './auth-client';
import { CUSTOMER_COOKIE } from './cart-api';

/** Stores a customer access token in the httpOnly session cookie. */
export async function keepCustomerSession(session: {
  readonly accessToken: string;
  readonly expiresAt: string;
}): Promise<string> {
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new AuthApiError('unavailable');
  (await cookies()).set(CUSTOMER_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env['CUSTOMER_WEB_ORIGIN'] ?? '').startsWith('https:'),
    path: '/',
    expires: new Date(session.expiresAt),
  });
  return session.accessToken;
}

/** First X-Forwarded-For hop, so the API can throttle per client. */
export async function clientIp(): Promise<string | undefined> {
  return forwardedClientIp((await headers()).get('x-forwarded-for'));
}
