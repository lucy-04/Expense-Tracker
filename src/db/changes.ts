import { useEffect, useState, useSyncExternalStore } from 'react';

// A global "data version": every write bumps it, every query hook re-runs on change.
let version = 0;
const listeners = new Set<() => void>();

export function notifyChanged() {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDataVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/**
 * Runs an async query and re-runs it whenever `deps` change or the database is written.
 * `deps` must capture every input of `fn`.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: Error | undefined } {
  const v = useDataVersion();
  const [state, setState] = useState<{ data: T | undefined; error: Error | undefined }>({ data: undefined, error: undefined });
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ data, error: undefined }),
      (error: Error) => live && setState((s) => ({ data: s.data, error })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, ...deps]);
  return state;
}
