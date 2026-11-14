import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api, ApiError, type RequestOptions } from './api';
import { SHOP_URL } from './config';
import { readValue, removeValue, writeValue } from './storage';
import type { Account, Locale, LoginResult, SellerAccount } from './types';

const TOKEN_KEY = 'atlas.session';
const SESSION_ENDED = new Set(['AUTHENTICATION_REQUIRED', 'SESSION_REVOKED', 'SESSION_NOT_FOUND']);

export type Actor = 'customer' | 'seller';
/** After the password: done, or the seller's authenticator step (code, or first-time setup). */
export type SignInStep =
  | { readonly step: 'done' }
  | { readonly step: 'code' }
  | { readonly step: 'enroll'; readonly secret: string; readonly otpauthUri: string };

export interface SellerRegistration {
  readonly email: string;
  readonly password: string;
  readonly storeName: string;
  readonly descriptionFr: string;
  readonly descriptionAr: string;
}

interface Stored {
  readonly token: string;
  readonly actor: Actor;
}

interface Session {
  readonly status: 'loading' | 'signedOut' | 'signedIn';
  readonly actor: Actor | null;
  readonly account: Account | null;
  readonly seller: SellerAccount | null;
  /** Authenticated API call; an expired session signs the user out. */
  readonly request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  readonly signIn: (email: string, password: string, totpCode?: string) => Promise<SignInStep>;
  /** Development builds only: the local API's demo accounts (local orders are limited to them). */
  readonly signInDemo: (actor: Actor) => Promise<void>;
  readonly register: (email: string, password: string, locale: Locale) => Promise<void>;
  /** Buy without an account: the API creates it and emails a link to choose a password. */
  readonly signInGuest: (email: string, locale: Locale) => Promise<void>;
  readonly registerSeller: (input: SellerRegistration) => Promise<SignInStep>;
  readonly signOut: () => Promise<void>;
  readonly refreshAccount: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

const parseStored = (raw: string | null): Stored | null => {
  if (raw === null) return null;
  // Earlier versions stored the bare customer token.
  if (!raw.startsWith('{')) return { token: raw, actor: 'customer' };
  try {
    const value = JSON.parse(raw) as Stored;
    return typeof value.token === 'string' &&
      (value.actor === 'customer' || value.actor === 'seller')
      ? value
      : null;
  } catch {
    return null;
  }
};

async function revoke(token: string) {
  try {
    const list = await api<{ sessions: { id: string; current: boolean }[] }>(
      '/api/v1/auth/sessions',
      { token },
    );
    const current = list.sessions.find((session) => session.current);
    if (current) await api(`/api/v1/auth/sessions/${current.id}`, { method: 'DELETE', token });
  } catch {
    // The token is forgotten on this phone either way.
  }
}

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [status, setStatus] = useState<Session['status']>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [seller, setSeller] = useState<SellerAccount | null>(null);
  // The token used by requests, and a promise settled once the saved session has been read:
  // screens opened directly (deep link, restart) must not call the API without their token.
  const token = useRef<string | null>(null);
  const [ready] = useState(() => {
    let settle = () => {};
    const promise = new Promise<void>((resolve) => {
      settle = resolve;
    });
    return { promise, settle };
  });

  const forget = useCallback(async () => {
    token.current = null;
    await removeValue(TOKEN_KEY);
    setStored(null);
    setAccount(null);
    setSeller(null);
    setStatus('signedOut');
  }, []);

  const loadProfile = useCallback(
    async (current: Stored) => {
      try {
        if (current.actor === 'seller') {
          setSeller(await api<SellerAccount>('/api/v1/seller/account', { token: current.token }));
        } else {
          setAccount(await api<Account>('/api/v1/account', { token: current.token }));
        }
      } catch (error) {
        if (error instanceof ApiError && SESSION_ENDED.has(error.code)) await forget();
      }
    },
    [forget],
  );

  const keep = useCallback(
    async (next: Stored) => {
      await writeValue(TOKEN_KEY, JSON.stringify(next));
      token.current = next.token;
      setAccount(null);
      setSeller(null);
      setStored(next);
      setStatus('signedIn');
      await loadProfile(next);
    },
    [loadProfile],
  );

  useEffect(() => {
    void readValue(TOKEN_KEY).then(async (raw) => {
      const saved = parseStored(raw);
      token.current = saved?.token ?? null;
      ready.settle();
      if (saved === null) {
        setStatus('signedOut');
        return;
      }
      setStored(saved);
      setStatus('signedIn');
      await loadProfile(saved);
    });
  }, [loadProfile, ready]);

  const request = useCallback(
    async <T,>(path: string, options: RequestOptions = {}) => {
      await ready.promise;
      const sent = token.current;
      try {
        return await api<T>(path, { ...options, token: sent });
      } catch (error) {
        // Only a rejected token ends the session (not a call made while signed out).
        if (
          sent !== null &&
          sent === token.current &&
          error instanceof ApiError &&
          SESSION_ENDED.has(error.code)
        ) {
          await forget();
        }
        throw error;
      }
    },
    [ready, forget],
  );

  const signIn = useCallback(
    async (email: string, password: string, totpCode?: string): Promise<SignInStep> => {
      const result = await api<LoginResult>('/api/v1/auth/login', {
        body: { email, password, ...(totpCode ? { totpCode } : {}) },
      });
      if (result.status === 'INVALID_CREDENTIALS') throw new ApiError('INVALID_CREDENTIALS', 401);
      if (result.status === 'MFA_REQUIRED') return { step: 'code' };
      if (result.status === 'MFA_ENROLLMENT_REQUIRED') {
        return { step: 'enroll', secret: result.secret, otpauthUri: result.otpauthUri };
      }
      if (result.actorType !== 'customer' && result.actorType !== 'seller_user') {
        await revoke(result.accessToken);
        throw new ApiError('STAFF_ACCOUNT', 403);
      }
      await keep({
        token: result.accessToken,
        actor: result.actorType === 'seller_user' ? 'seller' : 'customer',
      });
      return { step: 'done' };
    },
    [keep],
  );

  const signInDemo = useCallback(
    async (actor: Actor) => {
      const session = await api<{ accessToken: string }>('/api/v1/local/session', {
        body: { account: actor },
      });
      await keep({ token: session.accessToken, actor });
    },
    [keep],
  );

  const register = useCallback(
    async (email: string, password: string, locale: Locale) => {
      await api('/api/v1/auth/register/customer', { body: { email, password, locale } });
      await signIn(email, password);
    },
    [signIn],
  );

  const signInGuest = useCallback(
    async (email: string, locale: Locale) => {
      const result = await api<{ accessToken: string }>('/api/v1/auth/register/guest', {
        // The set-password link opens the shop website.
        body: { email, locale, origin: SHOP_URL },
      });
      await keep({ token: result.accessToken, actor: 'customer' });
    },
    [keep],
  );

  const registerSeller = useCallback(
    async (input: SellerRegistration) => {
      await api('/api/v1/auth/register/seller', { body: input });
      return signIn(input.email, input.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    if (stored) await revoke(stored.token);
    await forget();
  }, [stored, forget]);

  const refreshAccount = useCallback(async () => {
    if (stored !== null) await loadProfile(stored);
  }, [stored, loadProfile]);

  const value = useMemo(
    () => ({
      status,
      actor: stored?.actor ?? null,
      account,
      seller,
      request,
      signIn,
      signInDemo,
      register,
      signInGuest,
      registerSeller,
      signOut,
      refreshAccount,
    }),
    [
      status,
      stored,
      account,
      seller,
      request,
      signIn,
      signInDemo,
      register,
      signInGuest,
      registerSeller,
      signOut,
      refreshAccount,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession outside SessionProvider');
  return value;
}
