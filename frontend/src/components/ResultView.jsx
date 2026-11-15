import { LEVEL_TEXT } from "../lib/levels.js";
import { QUESTIONNAIRES, SAFETY_MESSAGE } from "../lib/questionnaires.js";
import ScoreRing from "./ScoreRing.jsx";

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "–";

// A bar split into the severity bands, with a marker where the score falls.
function ScaleBar({ definition, score }) {
  if (!definition) return null;
  const slots = definition.max + 1;
  let start = 0;
  return (
    <div className="scale" role="img" aria-label={`Score ${score} of ${definition.max}`}>
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

// One result: score, severity, advice and every answer. `result` comes from
// parseResponse, so it looks the same for a new result and for an old one.
export default function ResultView({ result }) {
  // The safety message is already shown in its own card.
  const advice = (result.recommendation ?? "").replace(SAFETY_MESSAGE, "").trim();
  const definition = QUESTIONNAIRES[result.questionnaire];

  return (
    <div className="result">
      {result.item9Alert && (
        <div className="safety" role="alert">
          <span className="safety-icon" aria-hidden="true">
            !
          </span>
          <p>{SAFETY_MESSAGE}</p>
        </div>
      )}

      <div className="result-hero">
        <ScoreRing score={result.score} max={result.max} level={result.level} size={112} showMax />
        <div>
          <span className={`level-tag level-${result.level ?? "none"}`}>
            {result.level ? LEVEL_TEXT[result.level] : "Result"}
          </span>
          <p className="result-severity">{result.severity}</p>
          {result.average != null && <p className="muted">Average per question: {result.average}</p>}
        </div>
      </div>

      <ScaleBar definition={definition} score={result.score} />

      <section className={`advice level-${result.level ?? "none"}`}>
        <h3>Proposed treatment</h3>
        <p>{advice || "No recommendation was stored."}</p>
      </section>

      <p className="muted result-meta">
        {result.title} · answered by {result.answeredBy} · {when(result.answeredAt)}
      </p>

      <details>
        <summary>Show the {result.items.length} answers</summary>
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
