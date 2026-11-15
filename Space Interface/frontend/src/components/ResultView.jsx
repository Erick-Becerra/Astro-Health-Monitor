import { QUESTIONNAIRES, SAFETY_MESSAGE, localized, safetyMessageFor } from "../lib/questionnaires.js";
import { SAFETY_MESSAGE_ES } from "../lib/questionnaires-es.js";
import { localeOf, useLang } from "../shared/lang.js";
import { useT } from "../shared/useT.js";
import ScoreRing from "./ScoreRing.jsx";

function ScaleBar({ definition, score, label }) {
  if (!definition) return null;
  const slots = definition.max + 1;
  let start = 0;
  return (
    <div className="scale" role="img" aria-label={label}>
      <div className="scale-bands">
        {definition.severities.map((band) => {
          const width = ((band.upTo - start + 1) / slots) * 100;
          start = band.upTo + 1;
          return <span key={band.key} className={`level-${band.level}`} style={{ width: `${width}%` }} title={band.label} />;
        })}
      </div>
      <span className="scale-marker" style={{ left: `${((score + 0.5) / slots) * 100}%` }} />
    </div>
  );
}

export default function ResultView({ result }) {
  const t = useT();
  const lang = useLang();
  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(localeOf(lang), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "–";

  const advice = (result.recommendation ?? "").replace(SAFETY_MESSAGE, "").replace(SAFETY_MESSAGE_ES, "").trim();
  const base = QUESTIONNAIRES[result.questionnaire];
  const definition = base ? localized(base, lang) : null;

  return (
    <div className="result">
      {result.item9Alert && (
        <div className="safety" role="alert">
          <span className="safety-icon" aria-hidden="true">
            !
          </span>
          <p>{safetyMessageFor(lang)}</p>
        </div>
      )}

      <div className="result-hero">
        <ScoreRing score={result.score} max={result.max} level={result.level} size={112} showMax />
        <div>
          <span className={`level-tag level-${result.level ?? "none"}`}>
            {result.level ? t.levelWord(result.level) : t.ui("rResult")}
          </span>
          <p className="result-severity">{result.severity}</p>
          {result.average != null && <p className="muted">{t.ui("rAverage", { n: result.average })}</p>}
        </div>
      </div>

      <ScaleBar definition={definition} score={result.score} label={t.ui("rScore", { score: result.score, max: definition?.max })} />

      <section className={`advice level-${result.level ?? "none"}`}>
        <h3>{t.ui("rTreatment")}</h3>
        <p>{advice || t.ui("rNoRec")}</p>
      </section>

      <p className="muted result-meta">
        {result.title} · {t.ui("rAnsweredBy", { name: result.answeredBy })} · {when(result.answeredAt)}
      </p>

      <details>
        <summary>{t.ui("rShowAnswers", { n: result.items.length })}</summary>
        <ol className="answers">
          {result.items.map((item) => (
            <li key={item.n}>
              <span>{item.question}</span>
              <strong>
                <i>{item.answer}</i> {item.label}
              </strong>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
