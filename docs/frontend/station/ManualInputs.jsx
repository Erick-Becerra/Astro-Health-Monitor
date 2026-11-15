import { useState } from "react";
import { describeError } from "../shared/request.js";
import { QUESTIONNAIRES, buildQuestionnaire } from "../shared/questionnaires.js";
import { station } from "./stationApi.js";

const ANSWER_LABELS = ["Not at all", "Several days", "More than half the days", "Nearly every day"]; // 0 to 3

/**
 * The inputs of the astronaut (App 2): blood pressure, glucose, PHQ-9, GAD-7 and the log of symptoms and actions.
 * Every form sends to the station and shows the answer: the level, the advice, and (PHQ-9) the item 9 alert.
 * The 422 errors of the backend are shown as they come (they say which value is out of range).
 *
 *   <ManualInputs astronautId="AST-01" actor="Lucía Fernández" t={t} onSaved={() => refresh()} />
 */
export default function ManualInputs({ astronautId, actor, t, onSaved }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = (call) => async (event) => {
    event.preventDefault();
    setError(null);
    try {
      setResult(await call(new FormData(event.currentTarget)));
      onSaved?.();
    } catch (e) {
      setResult(null);
      setError(describeError(e));
    }
  };
  const num = (form, name) => Number(form.get(name));

  return (
    <section className="manual-inputs">
      <form onSubmit={submit((f) => station.bloodPressure(astronautId, { systolic: num(f, "systolic"), diastolic: num(f, "diastolic") }, actor))}>
        <h3>{t.manualKind("blood_pressure")}</h3>
        <input name="systolic" type="number" placeholder="Systolic" required />
        <input name="diastolic" type="number" placeholder="Diastolic" required />
        <button>{t.ui("save")}</button>
      </form>

      <form onSubmit={submit((f) => station.glucose(astronautId, { value: num(f, "value"), context: f.get("context") }, actor))}>
        <h3>{t.manualKind("glucose")}</h3>
        <input name="value" type="number" placeholder="mg/dL" required />
        <select name="context">
          <option value="fasting">{t.glucoseContext("fasting")}</option>
          <option value="postprandial">{t.glucoseContext("postprandial")}</option>
        </select>
        <button>{t.ui("save")}</button>
      </form>

      {/* The screen works out the score, the severity and the recommendation; the backend keeps the JSON whole. */}
      {["phq9", "gad7"].map((kind) => (
        <Questionnaire key={kind} kind={kind} items={QUESTIONNAIRES[kind].items} title={t.manualKind(kind)} onSubmit={submit} t={t}
          send={(answers) => station.saveQuestionnaire(astronautId,
            buildQuestionnaire({ kind, answers, answeredBy: actor ?? astronautId, t }), actor)} />
      ))}

      <form onSubmit={submit((f) => station.log(astronautId, { type: f.get("type"), note: f.get("note") || undefined }, actor))}>
        <h3>{t.manualKind("countermeasure")}</h3>
        <select name="type">
          {Object.keys(t.dict.countermeasures).map((c) => <option key={c} value={c}>{t.countermeasure(c)}</option>)}
        </select>
        <input name="note" placeholder="Nota (opcional)" maxLength={500} />
        <button>{t.ui("save")}</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {result && <Verdict result={result} t={t} />}
    </section>
  );
}

function Questionnaire({ kind, items, title, send, onSubmit, t }) {
  return (
    <form onSubmit={onSubmit((f) => send(Array.from({ length: items }, (_, i) => Number(f.get(`a${i}`)))))}>
      <h3>{title}</h3>
      {Array.from({ length: items }, (_, i) => (
        <label key={i}>
          {i + 1}
          <select name={`a${i}`} defaultValue="0">
            {ANSWER_LABELS.map((label, value) => <option key={value} value={value}>{value} · {label}</option>)}
          </select>
        </label>
      ))}
      <button>{t.ui("save")}</button>
    </form>
  );
}

/** What the backend answered to a capture: the colour and what to do. */
function Verdict({ result, t }) {
  return (
    <div className="verdict" data-level={result.level}>
      <strong style={{ color: t.levelColor(result.level) }}>{t.level(result.level)}</strong>
      {result.item9_alert && <p className="item9">{t.ui("item9Alert")}</p>}
      {result.severity && <p>{result.severity} ({result.score})</p>}
      {result.payload?.severity && <p>{t.questionnaireSeverity(result.payload.severity)} ({result.payload.score})</p>}
      {result.findings?.map((f) => <p key={f.indicator}>{f.advice}</p>)}
    </div>
  );
}
