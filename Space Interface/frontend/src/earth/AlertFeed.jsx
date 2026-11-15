import { useLayoutEffect, useRef, useState } from "react";
import { localeOf, useLang } from "../shared/lang.js";

const MAX = 12;
const GAP = 4;

export default function AlertFeed({ alerts, fallbackName, empty }) {
  const lang = useLang();
  const box = useRef(null);
  const [fit, setFit] = useState({ n: 2, lines: 2 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const article = el.querySelector("article");
      if (!article) return;
      const card = getComputedStyle(article);
      const text = getComputedStyle(article.querySelector("p"));
      const lineHeight = parseFloat(text.lineHeight) || parseFloat(text.fontSize) * 1.5;
      const chrome =
        parseFloat(card.paddingTop) + parseFloat(card.paddingBottom) +
        article.querySelector("small").offsetHeight + parseFloat(text.marginTop) + parseFloat(text.marginBottom);
      const height = el.clientHeight;
      const n = Math.max(1, Math.min(alerts.length || 1, MAX, Math.floor((height + GAP) / (chrome + 2 * lineHeight + GAP))));
      const each = (height - (n - 1) * GAP) / n;
      const lines = Math.max(1, Math.floor((each - chrome) / lineHeight));
      setFit((prev) => (prev.n === n && prev.lines === lines ? prev : { n, lines }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [alerts.length, alerts[0]?.id]);

  return (
    <div className="alert-feed" ref={box} style={{ "--lines": fit.lines }}>
      {alerts.length === 0 && <p className="muted">{empty}</p>}
      {alerts.slice(0, fit.n).map((a) => (
        <article key={a.id} data-severity={a.severity}>
          <small>{new Date(a.created_at).toLocaleString(localeOf(lang))}{` · ${a.name ?? fallbackName ?? a.astronaut_id}`}</small>
          <p>{a.summary}</p>
        </article>
      ))}
    </div>
  );
}
