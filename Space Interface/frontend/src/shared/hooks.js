import { useEffect, useRef, useState } from "react";

export function usePolling(fetcher, { seconds = 2, enabled = true, deps = [] } = {}) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, data: null, error: null, loading: true, updatedAt: null });
  const [bump, setBump] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;

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
  }, [seconds, enabled, bump, key]);

  const current = state.key === key ? state : (cache.current.get(key) ?? { data: null, error: null, loading: true, updatedAt: null });

  return { ...current, refresh: () => setBump((n) => n + 1) };
}
