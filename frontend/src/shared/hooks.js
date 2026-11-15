import { useEffect, useRef, useState } from "react";

/**
 * Asks the server again every `seconds` and keeps the last answer. No extra library needed.
 *
 *   const { data, error, loading, updatedAt } = usePolling(() => station.dashboard(id), { seconds: 2, deps: [id] });
 *
 * - The next request starts only when the previous one has finished (they never pile up).
 * - It pauses while the browser tab is hidden.
 * - If a request fails, `data` keeps the last good answer and `error` is set: show the old data
 *   with a warning instead of an empty screen. `error` goes back to null with the next good answer.
 * - `updatedAt` is the time of the last good answer (use isStale() to warn about old data).
 * - `refresh()` asks again right away.
 *
 * SWR and React Query do the same: useSWR(key, fetcher, { refreshInterval: 2000 }) or
 * useQuery({ queryKey, queryFn, refetchInterval: 2000 }). Use them instead if the project already has them.
 */
export function usePolling(fetcher, { seconds = 2, enabled = true, deps = [] } = {}) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, data: null, error: null, loading: true, updatedAt: null });
  const [bump, setBump] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;
  // The last good answer of each key (for example each astronaut): coming back to one shows its last data at once.
  const cache = useRef(new Map());

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const data = await latest.current();
          const next = { key, data, error: null, loading: false, updatedAt: Date.now() };
          cache.current.set(key, next);
          if (!stopped) setState(next);
        } catch (error) {
          const next = { ...(cache.current.get(key) ?? { data: null, updatedAt: null }), key, error, loading: false };
          cache.current.set(key, next);
          if (!stopped) setState(next);
        }
      }
      if (!stopped) timer = setTimeout(tick, seconds * 1000);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, enabled, bump, key]);

  // Data of another key (the astronaut just changed) is never shown as if it were this one's.
  const current = state.key === key ? state : (cache.current.get(key) ?? { data: null, error: null, loading: true, updatedAt: null });
  // refresh(): ask again right now (for example after saving something) instead of waiting for the next turn.
  return { ...current, refresh: () => setBump((n) => n + 1) };
}
