import { parseResponse, QUESTIONNAIRES, localized, reminder } from "../lib/questionnaires.js";
import { useLang } from "../shared/lang.js";
import { useT } from "../shared/useT.js";

const hours = (value) => (value >= 1 ? `${Math.floor(value)} h` : `${Math.max(1, Math.round(value * 60))} min`);

// The two questionnaires at a glance: the last result, whether it is time to
// answer again (every 24 h), and a button on each to answer.
// `rows` is the list from the station, newest first.
export default function WellbeingPanel({ rows, now, onAnswer, offline = false }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="wellbeing">
      {Object.values(QUESTIONNAIRES).map((base) => {
        const definition = localized(base, lang);
        const latest = rows?.find((row) => row.questionnaire === definition.id);
        const last = latest ? parseResponse(latest, lang) : null;
        const { due, hoursLeft } = reminder(latest, now);
        return (
          <article key={definition.id} className={`survey${due ? " survey-due" : ""}`}>
            <div className="survey-body">
              <h3>{definition.title}</h3>
              <p className="survey-last">
                {offline
                  ? t.ui("wbOffline")
                  : rows === null
                  ? t.ui("loading")
                  : last
                    ? `${last.level ? t.levelWord(last.level) : last.severity} \u00b7 ${t.ui("wbLastAnswer")}`
                    : t.ui("wbNotAnswered")}
              </p>
              {!offline && (
                <span className={`level-tag ${due ? "level-orange" : "level-green"}`}>
                  {due ? t.ui("wbTimeToAnswer") : t.ui("wbNextIn", { time: hours(hoursLeft) })}
                </span>
              )}
            </div>
            <button type="button" className="button" onClick={() => onAnswer(definition.id)}>
              {latest && !offline ? t.ui("wbAnswerAgain") : t.ui("wbAnswer")}
            </button>
          </article>
        );
      })}
    </div>
  );
}
