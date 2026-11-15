import { useState } from "react";

// How a severity from the API is painted. The backend decides what each report means (severe = critical alert);
// this only maps the three words to the same palette as the levels.
const SEVERITY_COLOR = { mild: "yellow", moderate: "orange", severe: "red" };
const humanize = (v) => String(v ?? "").replaceAll("_", " ");
const num = (n) => (typeof n === "number" ? String(+n.toFixed(2)) : String(n));

function Vitals({ vitals, t }) {
  const items = Object.entries(vitals ?? {}).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
  if (!items.length) return null;
  return (
    <p className="symptom-vitals">
      {items.map(([k, v]) => `${t.indicator(k)}: ${num(v)}${t.unit(k) ? ` ${t.unit(k)}` : ""}`).join(" · ")}
    </p>
  );
}

/**
 * The symptom reports the crew sent from the station ("my head hurts", "I got hurt"), for ONE astronaut.
 * Each report also raises an alert in the feed; here they are kept per astronaut.
 *
 *   <SymptomPanel name={name} reports={data} error={msg} loading={false} t={t} />
 */
export default function SymptomPanel({ name, reports, error, loading, t }) {
  const [filter, setFilter] = useState("all");
  const list = (reports ?? []).filter((r) => filter === "all" || r.severity === filter);
  return (
    <section className="console symptoms" aria-label="Symptom reports">
      <header className="console-head">
        <strong>{name ?? "No astronaut selected"}</strong>
        <span className="muted">{reports ? `${reports.length} report${reports.length === 1 ? "" : "s"}` : ""}</span>
        <select className="follow-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by severity">
          <option value="all">All severities</option>
          <option value="severe">Severe</option>
          <option value="moderate">Moderate</option>
          <option value="mild">Mild</option>
        </select>
      </header>
      <div className="console-body">
        {!name && <p className="muted">Select an astronaut from the list.</p>}
        {name && error && !reports && <p role="alert">{error}</p>}
        {name && loading && !reports && <p className="muted">Loading…</p>}
        {name && reports && list.length === 0 && (
          <p className="muted">{reports.length ? "No reports with this severity." : "No symptom reports for this astronaut."}</p>
        )}
        {list.map((r) => (
          <article className="symptom" key={r.id ?? r.reported_at} data-level={SEVERITY_COLOR[r.severity] ?? "unknown"}>
            <header>
              <span className="badge">{(r.severity ?? "unknown").toUpperCase()}</span>
              <strong>{humanize(r.symptom)}</strong>
              {r.body_area && <span className="muted">· {humanize(r.body_area)}</span>}
              <time className="muted">{new Date(r.reported_at).toLocaleString("en-GB")}</time>
            </header>
            {r.description && <p className="symptom-text">{r.description}</p>}
            <p className="muted">Reported by {r.reported_by ?? "—"}</p>
            <Vitals vitals={r.vitals} t={t} />
          </article>
        ))}
      </div>
    </section>
  );
}
