import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import en from "../shared/i18n-en.json";
import { makeTranslator } from "../shared/i18n.js";
import { ACTOR, USE_MOCKS, describeError } from "../shared/request.js";
import { earth } from "./earthApi.js";
import { toChartData } from "./chartData.js";
import "./report.css";

const t = makeTranslator(en);
const BUCKET_POINTS = 240; // about this many points per chart
const LINE_COLORS = ["#002456", "#fe3938"];
const SECTIONS = [
  { title: "Heart rate", keys: ["heart_rate"] },
  { title: "Blood pressure", keys: ["blood_pressure_systolic", "blood_pressure_diastolic"] },
  { title: "Core temperature", keys: ["body_temperature"] },
  { title: "Oxygen saturation", keys: ["spo2"] },
  { title: "Respiratory rate", keys: ["respiratory_rate"] },
  { title: "Sleep", keys: ["sleep_hours"] },
  { title: "Reaction time (PVT-B)", keys: ["pvt_b_ms"] },
  { title: "Radiation rate", keys: ["radiation_rate_msv_day"] },
  { title: "Cabin CO₂", keys: ["cabin_co2_mmhg"] },
];

const num = (n) => String(+Number(n).toFixed(2));
const SEVERITIES = ["severe", "moderate", "mild"];
const humanize = (v) => String(v ?? "").replaceAll("_", " ");
const fmtDate = (d) => d.toLocaleDateString("en-GB");
const fmtDateTime = (d) => d.toLocaleString("en-GB");

function stats(values) {
  const v = values.filter((x) => typeof x === "number");
  if (!v.length) return null;
  return { n: v.length, min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length, last: v[v.length - 1] };
}

function Section({ title, keys, readings, spanMs }) {
  const all = toChartData(readings, keys);
  const per = keys.map((k) => ({ key: k, s: stats(all.map((r) => r[k])) }));
  const present = per.filter((p) => p.s);
  if (!present.length) {
    return <section className="report-section"><h3>{title}</h3><p className="nodata">No data recorded in this period.</p></section>;
  }
  // Chart only when there is something to see: at least 3 samples and some variation.
  const varies = present.some((p) => p.s.n >= 3 && p.s.max > p.s.min);
  const samples = Math.max(...present.map((p) => p.s.n));
  const sparse = samples < 20; // daily measurements: draw only the real points
  const rows = sparse ? all.filter((r) => keys.some((k) => r[k] !== null)) : all;
  const lo = Math.min(...present.map((p) => p.s.min));
  const hi = Math.max(...present.map((p) => p.s.max));
  const pad = (hi - lo) * 0.15 || 1;
  const shortRange = spanMs <= 2 * 864e5;
  const yLabel = `${keys.length === 1 ? t.indicator(keys[0]) : title} (${t.unit(keys[0])})`;

  return (
    <section className="report-section">
      <h3>{title}</h3>
      {varies ? (
        <LineChart width={654} height={230} data={rows} margin={{ top: 8, right: 16, left: 6, bottom: 26 }}>
          <CartesianGrid stroke="#d9e0f2" strokeDasharray="3 3" />
          <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]}
                 tickFormatter={(ms) => (shortRange
                   ? new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                   : new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" }))}
                 label={{ value: shortRange ? "Time (local)" : "Date (day/month)", position: "insideBottom", offset: -16, fill: "#1b3f7a", fontSize: 12 }} />
          <YAxis domain={[+(lo - pad).toFixed(1), +(hi + pad).toFixed(1)]} width={58}
                 label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" }, fill: "#1b3f7a", fontSize: 12 }} />
          {keys.length > 1 && <Legend verticalAlign="top" height={24} />}
          {keys.map((k, i) => (
            <Line key={k} dataKey={k} name={t.indicator(k)} stroke={LINE_COLORS[i]} strokeWidth={2}
                  dot={sparse ? { r: 3 } : false} isAnimationActive={false} connectNulls={false} />
          ))}
        </LineChart>
      ) : (
        <p className="flat">Not charted: {samples} sample{samples === 1 ? "" : "s"} with no variation in this period.</p>
      )}
      <dl className="stats">
        {present.map((p) => (
          <div key={p.key} style={{ display: "contents" }}>
            {present.length > 1 && <div className="stats-key">{t.indicator(p.key)}</div>}
            {[["Latest", p.s.last], ["Min", p.s.min], ["Avg", p.s.avg], ["Max", p.s.max]].map(([label, v]) => (
              <div key={label}><dt>{label}</dt><dd>{num(v)} {t.unit(p.key)}</dd></div>
            ))}
            <div><dt>Samples</dt><dd>{p.s.n}</dd></div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Symptoms the crew reported from the station during the period, oldest first, with the vitals of that moment. */
function SymptomsSection({ symptoms }) {
  const title = <h3>Symptoms reported</h3>;
  if (symptoms === null) {
    return <section className="report-section">{title}<p className="nodata">The symptom reports could not be loaded.</p></section>;
  }
  if (!symptoms.length) {
    return <section className="report-section">{title}<p className="nodata">No symptoms were reported in this period.</p></section>;
  }
  const counts = SEVERITIES.map((s) => [s, symptoms.filter((r) => r.severity === s).length]).filter(([, n]) => n > 0);
  return (
    <section className="report-section sym-section">
      {title}
      <p className="sym-summary">
        {symptoms.length} report{symptoms.length === 1 ? "" : "s"}:{" "}
        {counts.map(([s, n]) => <span key={s} className={`sev sev-${s}`}>{n} {s}</span>)}
      </p>
      <table className="sym-table">
        <thead><tr><th>Date and time</th><th>Severity</th><th>Symptom</th><th>Area</th><th>Reported by</th></tr></thead>
        <tbody>
          {symptoms.map((r, i) => {
            const vitals = Object.entries(r.vitals ?? {}).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
            return (
              <Fragment key={r.id ?? i}>
                <tr>
                  <td>{fmtDateTime(new Date(r.reported_at))}</td>
                  <td><span className={`sev sev-${r.severity}`}>{r.severity ?? "—"}</span></td>
                  <td>{humanize(r.symptom)}</td>
                  <td>{humanize(r.body_area) || "—"}</td>
                  <td>{r.reported_by ?? "—"}</td>
                </tr>
                {(r.description || vitals.length > 0) && (
                  <tr className="sym-detail">
                    <td colSpan={5}>
                      {r.description && <p>{r.description}</p>}
                      {vitals.length > 0 && (
                        <p className="sym-vitals">
                          At that moment: {vitals.map(([k, v]) => `${t.indicator(k)} ${num(v)}${t.unit(k) ? ` ${t.unit(k)}` : ""}`).join(" · ")}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** The sheet itself (pure: everything comes in as props). */
export function ReportView({ name, id, reqSince, reqUntil, first, since, until, readings, symptoms, signs, demo, actor }) {
  const sections = SECTIONS.filter((s) => !signs || s.keys.some((k) => signs.includes(k)));
  const spanMs = +until - +since;
  const trimmed = first && first > reqSince;
  return (
    <article className="report">
      <header className="report-head">
        <h1>Astronaut health report</h1>
        <h2>{name ?? id}</h2>
        <p>From {fmtDate(reqSince)} to {fmtDate(reqUntil)}</p>
        {demo && <span className="demo">DEMO DATA</span>}
      </header>
      <div className="report-body">
        {trimmed && (
          <p className="report-note">Data for this astronaut starts on {fmtDate(first)}. Earlier dates in the requested range have no records.</p>
        )}
        <SymptomsSection symptoms={symptoms ?? null} />
        {sections.map((s) => <Section key={s.title} {...s} readings={readings} spanMs={spanMs} />)}
      </div>
      <footer className="report-foot">Generated {fmtDateTime(new Date())} · Prepared by {actor} · Astro Health Monitor</footer>
    </article>
  );
}

/** Route /earth/report?astronaut=AST-01&from=2026-11-14&to=2026-11-15[&signs=heart_rate,spo2] */
export default function ReportPage() {
  const [params] = useSearchParams();
  const id = params.get("astronaut");
  const from = params.get("from");
  const to = params.get("to");
  const signs = params.get("signs")?.split(",") ?? null;
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await earth.astronauts();
        const a = list.find((x) => x.astronaut_id === id);
        const first = a?.first_seen ? new Date(a.first_seen) : null;
        const reqSince = new Date(`${from}T00:00:00`);
        const reqUntil = new Date(`${to}T23:59:59`);
        const since = first && first > reqSince ? first : reqSince;
        const until = reqUntil > new Date() ? new Date() : reqUntil;
        if (!a || since >= until) {
          if (alive) setState({ status: "empty", name: a?.name ?? id, first });
          return;
        }
        const bucketSeconds = Math.max(60, Math.ceil((until - since) / 1000 / BUCKET_POINTS));
        const range = { since: since.toISOString(), until: until.toISOString() };
        const [readings, symptoms] = await Promise.all([
          earth.readings(id, { ...range, bucketSeconds, limit: 5000 }),
          // A failure here must not break the whole report: the section says it could not be loaded.
          earth.symptomReports(id, { ...range, limit: 500 }).catch(() => null),
        ]);
        const ordered = Array.isArray(symptoms) ? [...symptoms].sort((x, y) => String(x.reported_at).localeCompare(String(y.reported_at))) : null;
        if (alive) setState({ status: "ready", name: a.name, first, since, until, reqSince, reqUntil, readings, symptoms: ordered });
      } catch (error) {
        if (alive) setState({ status: "error", message: describeError(error) });
      }
    })();
    return () => { alive = false; };
  }, [id, from, to]);

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <button type="button" onClick={() => window.print()} disabled={state.status !== "ready"}>Save as PDF / Print</button>
        <span>In the print dialog choose “Save as PDF”.</span>
      </div>
      {state.status === "loading" && <p className="report-toolbar no-print">Loading data…</p>}
      {state.status === "error" && <p className="report-toolbar no-print" role="alert">{state.message}</p>}
      {state.status === "empty" && (
        <p className="report-toolbar no-print" role="alert">
          No data for {state.name} in this range{state.first ? ` (records start on ${fmtDate(state.first)})` : ""}. Go back and pick another range.
        </p>
      )}
      {state.status === "ready" && <ReportView id={id} signs={signs} demo={USE_MOCKS} actor={ACTOR} {...state} />}
    </div>
  );
}
