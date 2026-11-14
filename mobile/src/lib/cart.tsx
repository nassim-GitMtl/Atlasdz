import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { errorCode } from './api';
import { useSession } from './session';
import type { CustomerCart } from './types';

interface Cart {
  /** Items in the customer's cart (tab badge). */
  readonly count: number;
  readonly refresh: () => Promise<void>;
  /** Adds `quantity` of an offer, retrying once if the cart changed meanwhile. */
  readonly add: (offerId: string, quantity: number) => Promise<void>;
}

const CartContext = createContext<Cart | null>(null);
const itemCount = (cart: CustomerCart) => cart.items.reduce((sum, line) => sum + line.quantity, 0);

export function CartProvider({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const active = session.status === 'signedIn' && session.actor === 'customer';
  const [stored, setCount] = useState(0);
  const { request } = session;
  // Signed out (or a seller): no cart, so no badge.
  const count = active ? stored : 0;

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      setCount(itemCount(await request<CustomerCart>('/api/v1/cart')));
    } catch {
      // The badge simply keeps its last value.
    }
  }, [active, request]);

  // Load the badge when the customer signs in (state is set in the callback, not the effect).
  useEffect(() => {
    if (!active) return;
    let current = true;
    request<CustomerCart>('/api/v1/cart').then(
      (cart) => {
        if (current) setCount(itemCount(cart));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [active, request]);

  const add = useCallback(
    async (offerId: string, quantity: number) => {
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
    [request],
  );

  const value = useMemo(() => ({ count, refresh, add }), [count, refresh, add]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const value = useContext(CartContext);
  if (value === null) throw new Error('useCart outside CartProvider');
  return value;
}
