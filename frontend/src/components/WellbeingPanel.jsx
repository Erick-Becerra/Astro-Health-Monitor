import { LEVEL_TEXT } from "../lib/levels.js";
import { parseResponse, QUESTIONNAIRES, reminder } from "../lib/questionnaires.js";
import ScoreRing from "./ScoreRing.jsx";

const hours = (value) => (value >= 1 ? `${Math.floor(value)} h` : `${Math.max(1, Math.round(value * 60))} min`);

// The two questionnaires at a glance: the last score, whether it is time to
// answer again (every 24 h), and a button on each to answer.
// `rows` is the list from the station, newest first.
export default function WellbeingPanel({ rows, now, onAnswer, onHistory, offline = false }) {
  return (
    <div className="wellbeing">
      {Object.values(QUESTIONNAIRES).map((definition) => {
        const latest = rows?.find((row) => row.questionnaire === definition.id);
        const last = latest ? parseResponse(latest) : null;
        const { due, hoursLeft } = reminder(latest, now);
        return (
          <article key={definition.id} className={`survey${due ? " survey-due" : ""}`}>
            <ScoreRing score={last?.score} max={last?.max ?? definition.max} level={last?.level} size={58} />
            <div className="survey-body">
              <h3>{definition.title}</h3>
              <p className="survey-last">
                {offline
                  ? "No connection"
                  : rows === null
                  ? "Loading…"
                  : last
                    ? `${last.level ? LEVEL_TEXT[last.level] : last.severity} · last answer`
                    : "Not answered yet"}
              </p>
              {!offline && (
                <span className={`level-tag ${due ? "level-orange" : "level-green"}`}>
                  {due ? "Time to answer" : `Next in ${hours(hoursLeft)}`}
                </span>
              )}
            </div>
            <button type="button" className="button" onClick={() => onAnswer(definition.id)}>
              {latest && !offline ? "Answer again" : "Answer"}
            </button>
          </article>
        );
      })}
      <button type="button" className="link-button" onClick={onHistory}>
        See past answers
      </button>
    </div>
  );
}
