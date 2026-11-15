import { useSyncExternalStore } from "react";

// Whether the backend answers. Every request reports here (see api.js), so the
// warning follows what really happens, whatever part of the screen asked.
//  - the first failure shows the warning;
//  - while it is down, later failures (the polling keeps trying) stay quiet, so
//    a warning the user closed does not keep coming back;
//  - touching something that needs the backend shows it again (warn);
//  - the first answer after a failure clears it by itself.
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

// Wraps an action that needs the backend: with no connection it shows the
// warning instead of doing anything.
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
