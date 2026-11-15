import es from "./i18n-es.json";
import en from "./i18n-en.json";
import { makeTranslator } from "./i18n.js";
import { getLang, useLang } from "./lang.js";

const translators = { es: makeTranslator(es), en: makeTranslator(en) };

/** The translator of the language chosen in the settings. Re-renders the component when the language changes. */
export function useT() {
  const lang = useLang();
  return translators[lang];
}

/** For code outside React (it does not re-render by itself). */
export const currentT = () => translators[getLang()];
