import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'atlas_seller_session';

export async function accessToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Remembers whether the signed-in account is a seller or Atlas staff, to pick the menu.
 * Display only: the API authorises every request with the session token. */
export const KIND_COOKIE = 'atlas_seller_kind';
export type AccountKind = 'seller' | 'staff';
export async function accountKind(): Promise<AccountKind | undefined> {
  const value = (await cookies()).get(KIND_COOKIE)?.value;
  return value === 'seller' || value === 'staff' ? value : undefined;
}
