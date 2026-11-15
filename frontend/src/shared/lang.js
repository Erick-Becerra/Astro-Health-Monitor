import { useSyncExternalStore } from "react";

// The language of the whole platform. It is saved in the browser, so it is remembered the next time.
export const LANGS = [
  ["es", "Español"],
  ["en", "English"],
];
const KEY = "ahm.lang";

const read = () => {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* storage can be blocked: the default is used */
  }
  return "es";
};

let current = read();
const listeners = new Set();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = () => current;

export function setLang(next) {
  if (next === current || (next !== "es" && next !== "en")) return;
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* not saved, but it works for this session */
  }
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useLang = () => useSyncExternalStore(subscribe, getLang);

/** Locale for dates and numbers. */
export const localeOf = (lang) => (lang === "en" ? "en-GB" : "es-CL");
