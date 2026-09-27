import { useEffect, useState } from 'react';
import { fetchApi } from './client';

export interface ManagementData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Loads GET /api/management{path}; session expiry is handled by the client + auth guard. */
export function useManagementData<T>(path: string): ManagementData<T> {
  const [state, setState] = useState<ManagementData<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetchApi<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Request failed.';
          setState({ data: null, loading: false, error: message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
