import es from "./i18n-es.json";
import en from "./i18n-en.json";
import { makeTranslator } from "./i18n.js";
import { getLang, useLang } from "./lang.js";

const translators = { es: makeTranslator(es), en: makeTranslator(en) };

export function useT() {
  const lang = useLang();
  return translators[lang];
}

export const currentT = () => translators[getLang()];
