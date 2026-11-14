import { useEffect, useRef, useState } from 'react';

import { errorCode } from './api';
import { useRequest, type RequestState } from './use-request';

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * First page through useRequest, then "load more" pages appended below it. Reloading the first
 * page starts the list again.
 */
export function usePaged<T, P extends Page<T>>(
  key: string | null,
  load: (cursor: string | null) => Promise<P>,
): RequestState<P> & {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly moreError?: string;
  readonly loadMore: () => Promise<void>;
} {
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const first = useRequest(key, () => loader.current(null));
  const [extra, setExtra] = useState<{
    readonly from?: P;
    readonly items: readonly T[];
    readonly cursor: string | null;
  }>({ items: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string>();

  // Pages appended to an earlier first page are dropped when the first page reloads.
  const current = extra.from !== undefined && extra.from === first.data;
  const items = [...(first.data?.items ?? []), ...(current ? extra.items : [])];
  const cursor = current ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (cursor === null || loadingMore) return;
    const base = first.data;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const next = await loader.current(cursor);
      setExtra({
        from: base,
        items: [...(current ? extra.items : []), ...next.items],
        cursor: next.nextCursor,
      });
    } catch (error) {
      setMoreError(errorCode(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return { ...first, items, hasMore: cursor !== null, loadingMore, moreError, loadMore };
}
