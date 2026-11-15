import { useEffect, useRef, useState } from "react";
import en from "../shared/i18n-en.json";
import { makeTranslator } from "../shared/i18n.js";
import { describeError } from "../shared/request.js";
import { station } from "./stationApi.js";
import { NOMINAL, buildPacket, restoreNominal, scenarios, setMood, setRadiationTotal, setSleep } from "./simulator.js";

const t = makeTranslator(en);
// slider: [field of buildPacket, min, max, step]
const SLIDERS = [["hr", 20, 220, 1], ["sys", 70, 220, 1], ["dia", 40, 130, 1], ["temp", 34, 41, 0.1],
                 ["spo2", 70, 100, 1], ["rr", 6, 40, 1], ["co2", 0, 5, 0.1], ["rate", 0, 10, 0.01]];
const NAMES = { hr: "heart_rate", sys: "blood_pressure_systolic", dia: "blood_pressure_diastolic", temp: "body_temperature",
                spo2: "spo2", rr: "respiratory_rate", co2: "cabin_co2_mmhg", rate: "radiation_rate_msv_day" };

/**
 * The simulator panel (App 3): sliders and scenarios that send to the station. What the dashboard shows
 * comes back from the backend, so the screen of the console is the proof that it worked.
 * Sliders send a full packet at most once per second (two packets of the same second replace each other).
 *
 *   <SimulatorPanel astronautId="AST-01" actor="Simulador" />
 */
export default function SimulatorPanel({ astronautId, actor = "Simulador" }) {
  const [values, setValues] = useState(NOMINAL);
  const [signal, setSignal] = useState({});
  const [error, setError] = useState(null);
  const [scenario, setScenario] = useState("nominal");
  const first = useRef(true);

  const run = async (job) => {
    setError(null);
    try { await job(); } catch (e) { setError(describeError(e)); }
  };

  // Send the packet 600 ms after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const timer = setTimeout(() => run(() => station.sendPacket(buildPacket(astronautId, values, { signal, source: "manual_override" }), actor)), 600);
    return () => clearTimeout(timer);
  }, [values, signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: field === "activity" ? e.target.value : Number(e.target.value) }));

  return (
    <section className="simulator">
      <label>{t.ui("scenario")}
        <select value={scenario} onChange={(e) => { setScenario(e.target.value); run(() => scenarios[e.target.value](station, astronautId, actor)); }}>
          {Object.keys(scenarios).map((k) => <option key={k} value={k}>{t.scenario(k)}</option>)}
        </select>
      </label>

      <label>Actividad
        <select value={values.activity} onChange={set("activity")}>
          {Object.keys(t.dict.crewStates).map((s) => <option key={s} value={s}>{t.crewState(s)}</option>)}
        </select>
      </label>

      {SLIDERS.map(([field, min, max, step]) => (
        <label key={field}>{t.indicator(NAMES[field])} ({t.unit(NAMES[field])})
          <input type="range" min={min} max={max} step={step} value={values[field]} onChange={set(field)} />
          <output>{values[field]}</output>
        </label>
      ))}

      <fieldset>
        <legend>Sensor signal</legend>
        {["cardiovascular", "respiratory", "thermoregulation", "radiation_dosimetry"].map((g) => (
          <label key={g}>{t.sensorGroup(g)}
            <select value={signal[g] ?? "good"} onChange={(e) => setSignal((s) => ({ ...s, [g]: e.target.value }))}>
              {Object.keys(t.dict.signalQuality).map((q) => <option key={q} value={q}>{t.signalQuality(q)}</option>)}
            </select>
          </label>
        ))}
      </fieldset>

      <SleepAndMood astronautId={astronautId} actor={actor} run={run} />

      <button type="button" onClick={() => { setValues(NOMINAL); setSignal({}); run(() => restoreNominal(station, astronautId, actor)); }}>
        {t.ui("restoreNominal")}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

/** The sliders that do not go in the packet: sleep and nights, PHQ-9 / GAD-7, glucose, accumulated radiation. */
function SleepAndMood({ astronautId, actor, run }) {
  const [form, setForm] = useState({ hours: 7.5, nights: 1, phq9: 0, gad7: 0, item9: false, glucose: 90, radiation: 30, prior: 0 });
  const set = (name, number = true) => (e) => setForm((f) => ({ ...f, [name]: e.target.type === "checkbox" ? e.target.checked : number ? Number(e.target.value) : e.target.value }));
  return (
    <fieldset>
      <legend>{t.card("sleep")} · {t.card("mood")} · {t.card("glucose")} · {t.card("radiation")}</legend>
      <label>Hours of sleep<input type="number" step="0.1" value={form.hours} onChange={set("hours")} /></label>
      <label>{t.ui("nightsInARow")}<input type="number" min="1" max="7" value={form.nights} onChange={set("nights")} /></label>
      <button type="button" onClick={() => run(() => setSleep(station, astronautId, form.hours, form.nights, actor))}>Apply sleep</button>

      <label>PHQ-9 (0-27)<input type="range" min="0" max="27" value={form.phq9} onChange={set("phq9")} /><output>{form.phq9}</output></label>
      <label>GAD-7 (0-21)<input type="range" min="0" max="21" value={form.gad7} onChange={set("gad7")} /><output>{form.gad7}</output></label>
      <label><input type="checkbox" checked={form.item9} onChange={set("item9")} /> {t.ui("item9Alert")}</label>
      <button type="button" onClick={() => run(() => setMood(station, astronautId, { phq9: form.phq9, gad7: form.gad7, item9: form.item9 }, actor))}>Apply mood</button>

      <label>Glucosa (mg/dL)<input type="number" value={form.glucose} onChange={set("glucose")} /></label>
      <button type="button" onClick={() => run(() => station.glucose(astronautId, { value: form.glucose, context: "fasting" }, actor))}>Aplicar glucosa</button>

      <label>Total radiation (mSv)<input type="number" value={form.radiation} onChange={set("radiation")} /></label>
      <label>Dosis previa al vuelo (mSv)<input type="number" value={form.prior} onChange={set("prior")} /></label>
      <button type="button" onClick={() => run(() => setRadiationTotal(station, astronautId, form.radiation, form.prior, actor))}>Apply radiation</button>
    </fieldset>
  );
}
