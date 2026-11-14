import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'atlas_seller_session';

export async function accessToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
