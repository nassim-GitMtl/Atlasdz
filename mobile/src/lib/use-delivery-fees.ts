import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { parseDeliveryFees } from './cart-delivery';
import type { DeliveryFees } from './types';

/** Estimates are bound to the destination/cart/refresh key, and expire after a minute. */
export function useDeliveryFees(
  destinationId: string | null,
  sellerIds: readonly string[],
  cartKey: string,
  refreshKey: number,
) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    items?: DeliveryFees['items'];
    error?: boolean;
    expiresAt?: number;
  }>();
  const ids = [...new Set(sellerIds)].sort().join(',');
  const key = JSON.stringify([destinationId, ids, cartKey, refreshKey, revision]);
  const enabled = Boolean(destinationId && ids);
  useEffect(() => {
    if (!destinationId || !ids) return;
    let cancelled = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        // The API allows 20 sellers per request; a valid cart can contain more.
        const sellers = ids.split(',');
        const items: DeliveryFees['items'] = [];
        for (let start = 0; start < sellers.length; start += 20) {
          const batch = sellers.slice(start, start + 20);
          const query = new URLSearchParams({ destinationId, sellerIds: batch.join(',') });
          const response = await api<unknown>(`/api/v1/delivery/fees?${query}`);
          if (cancelled) return;
          items.push(...parseDeliveryFees(response, batch));
        }
        if (!cancelled) {
          setState({ key, items, expiresAt: Date.now() + 60_000 });
          expiry = setTimeout(() => setRevision((value) => value + 1), 60_000);
        }
      } catch {
        if (!cancelled) setState({ key, error: true });
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (expiry) clearTimeout(expiry);
    };
  }, [key, destinationId, ids]);
  const current = enabled && state?.key === key ? state : undefined;
  const fresh = current?.items !== undefined;
  return {
    items: fresh ? current?.items : undefined,
    loading: enabled && !current?.error && !fresh,
    error: current?.error === true,
    // Check again in the press handler if the app was suspended past the expiry timer.
    isFresh: () => current?.expiresAt !== undefined && current.expiresAt > Date.now(),
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}
