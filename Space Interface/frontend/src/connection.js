import { useSyncExternalStore } from "react";

let state = { down: false, hidden: false };
const listeners = new Set();

function set(next) {
  if (next.down === state.down && next.hidden === state.hidden) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export const connection = {
  failed: () => !state.down && set({ down: true, hidden: false }),
  ok: () => set({ down: false, hidden: false }),
  isDown: () => state.down,
  warn: () => set({ down: state.down, hidden: false }),
  dismiss: () => set({ down: state.down, hidden: true }),
};

export const needsBackend =
  (action) =>
  (...args) => {
    if (connection.isDown()) {
      connection.warn();
      return undefined;
    }
    return action(...args);
  };

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useConnection = () => useSyncExternalStore(subscribe, () => state);
