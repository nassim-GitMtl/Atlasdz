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

import {
  addressKey,
  rememberViewed,
  saveAddress,
  toggleFavorite,
  type ProductSummary,
  type SavedAddress,
} from './collections';
import { readJson, writeJson } from './local-store';
import { useSession } from './session';

const KEYS = { favorites: 'atlas.favorites', recent: 'atlas.recent', addresses: 'atlas.addresses' };

interface Library {
  readonly favorites: readonly ProductSummary[];
  readonly recent: readonly ProductSummary[];
  readonly addresses: readonly SavedAddress[];
  readonly isFavorite: (slug: string) => boolean;
  readonly toggle: (item: ProductSummary) => void;
  readonly viewed: (item: ProductSummary) => void;
  readonly rememberAddress: (address: SavedAddress) => void;
  readonly forgetAddress: (address: SavedAddress) => void;
}

const LibraryContext = createContext<Library | null>(null);

/** Favorites, recently viewed products and delivery addresses, kept on this phone. */
export function LibraryProvider({ children }: { readonly children: ReactNode }) {
  const [favorites, setFavorites] = useState<readonly ProductSummary[]>([]);
  const [recent, setRecent] = useState<readonly ProductSummary[]>([]);
  const [addresses, setAddresses] = useState<readonly SavedAddress[]>([]);

  useEffect(() => {
    void Promise.all([
      readJson<ProductSummary[]>(KEYS.favorites, []),
      readJson<ProductSummary[]>(KEYS.recent, []),
      readJson<SavedAddress[]>(KEYS.addresses, []),
    ]).then(([f, r, a]) => {
      setFavorites(f);
      setRecent(r);
      setAddresses(a);
    });
  }, []);

  // Addresses are personal: they leave the phone's storage when the customer signs out.
  const { status } = useSession();
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === 'signedIn' && status === 'signedOut') {
      setAddresses([]);
      void writeJson(KEYS.addresses, []);
    }
    previous.current = status;
  }, [status]);

  const update = useCallback(
    <T,>(key: string, set: (next: (current: T) => T) => void, change: (current: T) => T) =>
      set((current) => {
        const next = change(current);
        if (next !== current) void writeJson(key, next);
        return next;
      }),
    [],
  );

  // Actions only use functional updates, so they keep the same identity across renders.
  const toggle = useCallback(
    (item: ProductSummary) =>
      update<readonly ProductSummary[]>(KEYS.favorites, setFavorites, (list) =>
        toggleFavorite(list, item),
      ),
    [update],
  );
  const viewed = useCallback(
    (item: ProductSummary) =>
      update<readonly ProductSummary[]>(KEYS.recent, setRecent, (list) =>
        rememberViewed(list, item),
      ),
    [update],
  );
  const rememberAddress = useCallback(
    (address: SavedAddress) =>
      update<readonly SavedAddress[]>(KEYS.addresses, setAddresses, (list) =>
        saveAddress(list, address),
      ),
    [update],
  );
  const forgetAddress = useCallback(
    (address: SavedAddress) =>
      update<readonly SavedAddress[]>(KEYS.addresses, setAddresses, (list) =>
        list.filter((entry) => addressKey(entry) !== addressKey(address)),
      ),
    [update],
  );

  const value = useMemo<Library>(
    () => ({
      favorites,
      recent,
      addresses,
      isFavorite: (slug) => favorites.some((item) => item.slug === slug),
      toggle,
      viewed,
      rememberAddress,
      forgetAddress,
    }),
    [favorites, recent, addresses, toggle, viewed, rememberAddress, forgetAddress],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const value = useContext(LibraryContext);
  if (value === null) throw new Error('useLibrary outside LibraryProvider');
  return value;
}
