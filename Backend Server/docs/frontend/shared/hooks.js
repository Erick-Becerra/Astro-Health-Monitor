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
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const [bump, setBump] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const data = await latest.current();
          if (!stopped) setState({ data, error: null, loading: false, updatedAt: Date.now() });
        } catch (error) {
          if (!stopped) setState((s) => ({ ...s, error, loading: false }));
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
  }, [seconds, enabled, bump, ...deps]);

  // refresh(): ask again right now (for example after saving something) instead of waiting for the next turn.
  return { ...state, refresh: () => setBump((n) => n + 1) };
}
