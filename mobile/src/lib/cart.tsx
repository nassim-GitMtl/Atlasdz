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

import { errorCode } from './api';
import {
  addGuestLine,
  GUEST_CART_KEY,
  guestCount,
  setGuestQuantity,
  type GuestLine,
} from './guest-cart';
import { readJson, writeJson } from './local-store';
import { useSession } from './session';
import type { CustomerCart } from './types';

interface Cart {
  /** Items in the cart (tab badge): the account's cart, or the phone's when signed out. */
  readonly count: number;
  /** Signed out: the lines kept on the phone. */
  readonly guestLines: readonly GuestLine[];
  readonly refresh: () => Promise<void>;
  /** Adds `quantity` of an offer, retrying once if the cart changed meanwhile. */
  readonly add: (offerId: string, quantity: number, slug: string) => Promise<void>;
  readonly setGuestQuantity: (offerId: string, quantity: number) => void;
  /** Moves the phone's cart into the account's (once signed in) and returns the result. */
  readonly mergeGuest: () => Promise<CustomerCart | null>;
}

const CartContext = createContext<Cart | null>(null);
const itemCount = (cart: CustomerCart) => cart.items.reduce((sum, line) => sum + line.quantity, 0);

export function CartProvider({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const active = session.status === 'signedIn' && session.actor === 'customer';
  const signedOut = session.status === 'signedOut';
  const [stored, setCount] = useState(0);
  const [guestLines, setGuestLines] = useState<readonly GuestLine[]>([]);
  const guestRef = useRef<readonly GuestLine[]>([]);
  const merging = useRef<Promise<CustomerCart | null> | null>(null);
  const { request } = session;
  // Sellers have no cart; signed-out shoppers see the phone's cart.
  const count = active ? stored : signedOut ? guestCount(guestLines) : 0;

  const saveGuest = useCallback((next: readonly GuestLine[]) => {
    guestRef.current = next;
    setGuestLines(next);
    void writeJson(GUEST_CART_KEY, next);
  }, []);

  useEffect(() => {
    let current = true;
    void readJson<GuestLine[]>(GUEST_CART_KEY, []).then((lines) => {
      if (!current || !Array.isArray(lines)) return;
      guestRef.current = lines;
      setGuestLines(lines);
    });
    return () => {
      current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      setCount(itemCount(await request<CustomerCart>('/api/v1/cart')));
    } catch {
      // The badge simply keeps its last value.
    }
  }, [active, request]);

  const mergeGuest = useCallback(() => {
    merging.current ??= (async () => {
      try {
        const lines = guestRef.current;
        let cart = await request<CustomerCart>('/api/v1/cart');
        for (const line of lines) {
          const existing = cart.items.find((item) => item.offerId === line.offerId)?.quantity ?? 0;
          try {
            cart = await request<CustomerCart>(`/api/v1/cart/items/${line.offerId}`, {
              method: 'PUT',
              body: {
                quantity: Math.min(99, existing + line.quantity),
                expectedVersion: cart.version,
              },
            });
          } catch {
            // An offer no longer sold is left out; the rest still moves.
            cart = await request<CustomerCart>('/api/v1/cart');
          }
        }
        if (lines.length > 0) saveGuest([]);
        setCount(itemCount(cart));
        return cart;
      } finally {
        merging.current = null;
      }
    })();
    return merging.current;
  }, [request, saveGuest]);

  // Signing in (or checking out as a guest) brings the phone's cart into the account.
  useEffect(() => {
    if (!active) return;
    let current = true;
    const load = guestRef.current.length > 0 ? mergeGuest() : request<CustomerCart>('/api/v1/cart');
    load.then(
      (cart) => {
        if (current && cart) setCount(itemCount(cart));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [active, request, mergeGuest]);

  const add = useCallback(
    async (offerId: string, quantity: number, slug: string) => {
      if (!active) {
        saveGuest(addGuestLine(guestRef.current, offerId, slug, quantity));
        return;
      }
      for (let attempt = 0; ; attempt += 1) {
        const cart = await request<CustomerCart>('/api/v1/cart');
        const line = cart.items.find((item) => item.offerId === offerId);
        try {
          const updated = await request<CustomerCart>(`/api/v1/cart/items/${offerId}`, {
            method: 'PUT',
            body: {
              quantity: Math.min(99, (line?.quantity ?? 0) + quantity),
              expectedVersion: cart.version,
            },
          });
          setCount(itemCount(updated));
          return;
        } catch (error) {
          if (errorCode(error) !== 'CART_CONFLICT' || attempt > 0) throw error;
        }
      }
    },
    [active, request, saveGuest],
  );

  const setGuest = useCallback(
    (offerId: string, quantity: number) =>
      saveGuest(setGuestQuantity(guestRef.current, offerId, quantity)),
    [saveGuest],
  );

  const value = useMemo(
    () => ({
      count,
      guestLines,
      refresh,
      add,
      setGuestQuantity: setGuest,
      mergeGuest,
    }),
    [count, guestLines, refresh, add, setGuest, mergeGuest],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const value = useContext(CartContext);
  if (value === null) throw new Error('useCart outside CartProvider');
  return value;
}
