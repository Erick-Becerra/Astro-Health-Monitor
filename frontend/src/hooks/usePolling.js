import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../api.js";

const signature = (data) => JSON.stringify(data, (key, value) => (key === "generated_at" ? undefined : value));

// Keeps `load()` fresh. The next request starts only when the previous one has
// finished (no pile-up), polling pauses while the tab is hidden, and a failed
// request keeps the last data and reports the error.
function useLoop(load, intervalMs, key) {
  const [state, setState] = useState({ data: null, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const kick = useRef(() => {});

  useEffect(() => {
    setState({ data: null, error: null });
    if (key === null) return undefined;

    let stopped = false;
    let timer;

    const tick = async () => {
      clearTimeout(timer);
      if (!document.hidden) {
        try {
          const data = await loadRef.current();
          // Same answer as before (ignoring the time it was generated)? Keep the old
          // objects, so nothing on the screen has to render again.
          if (!stopped) {
            setState((prev) =>
              !prev.error && prev.data && signature(prev.data) === signature(data) ? prev : { data, error: null }
            );
          }
        } catch (error) {
          if (!stopped) setState((prev) => ({ ...prev, error }));
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    kick.current = tick;
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, intervalMs]);

  // Ask for fresh data right now (for example after saving something).
  const refresh = useCallback(() => kick.current(), []);
  return { ...state, refresh };
}

// One GET, repeated. Pass null to do nothing.
export function usePolling(path, intervalMs = 2000) {
  return useLoop(() => getJSON(path), intervalMs, path);
}

// Several GETs at once, repeated. Returns { data: { [id]: response }, errors: { [id]: error } }.
export function usePollingMany(ids, pathFor, intervalMs = 2000) {
  const key = ids.length ? ids.join("|") : null;
  const result = useLoop(
    async () => {
      const settled = await Promise.allSettled(ids.map((id) => getJSON(pathFor(id))));
      const data = {};
      const errors = {};
      settled.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") data[ids[index]] = outcome.value;
        else errors[ids[index]] = outcome.reason;
      });
      // Nothing answered: treat it as one failed request so the last data stays.
      if (!Object.keys(data).length) throw Object.values(errors)[0] ?? new Error("No answer");
      return { data, errors };
    },
    intervalMs,
    key
  );
  return { ...result, data: result.data?.data ?? null, errors: result.data?.errors ?? {} };
}
