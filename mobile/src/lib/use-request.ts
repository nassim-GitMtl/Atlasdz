import { useCallback, useEffect, useRef, useState } from 'react';

import { errorCode } from './api';

export interface RequestState<T> {
  readonly data?: T;
  readonly error?: string;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
}

/**
 * Loads data for a screen. `key` identifies what is loaded (null = nothing yet, e.g. signed
 * out); a new key loads again. Earlier data stays visible while reloading.
 */
export function useRequest<T>(key: string | null, load: () => Promise<T>): RequestState<T> {
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const [state, setState] = useState<Omit<RequestState<T>, 'reload'>>({ loading: key !== null });

  const reload = useCallback(async () => {
    if (key === null) return;
    setState((previous) => ({ data: previous.data, loading: true }));
    try {
      const data = await loader.current();
      setState({ data, loading: false });
    } catch (error) {
      setState((previous) => ({ data: previous.data, loading: false, error: errorCode(error) }));
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
