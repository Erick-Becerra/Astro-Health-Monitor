import { useEffect, useRef, useState } from "react";

// true: the colour also covers the label up to ":"  ·  false: the colour covers only "· [time]"
const COLOR_LABEL = false;
const MAX_BLOCKS = 80;

const num = (n, d = 2) => (typeof n === "number" ? String(+n.toFixed(d)) : String(n));
const line = (key, time, label, value, color) => ({ key, time, label, value, color });

// Today's entries show the time; older ones (manual captures) also show the day: "14/11 11:35:00".
function stamp(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB");
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })} ${time}`;
}

function vitalValue(v, unit) {
  if (v.no_signal) return "no signal";
  if (v.value === null || v.value === undefined) return "no data";
  return unit ? `${num(v.value)} ${unit}` : num(v.value);
}

/** Packet block: every vital, plus context, radiation and bone estimate that arrive with it. */
function telemetryBlock(d, t) {
  const time = stamp(d.measured_at);
  const neutral = t.levelColor(null);
  const entries = d.vitals.map((v) =>
    line(v.key, time, t.indicator(v.key).toUpperCase(), vitalValue(v, t.unit(v.key)), t.levelColor(v.level)));
  const env = d.environment ?? {};
  if (env.crew_state) entries.push(line("crew_state", time, "ACTIVITY", t.crewState(env.crew_state), neutral));
  if (env.mission_day != null) entries.push(line("mission_day", time, "MISSION DAY", env.mission_day, neutral));
  const rad = d.radiation;
  if (rad) {
    const color = t.levelColor(d.systems?.find((s) => s.system === "radiation")?.level);
    entries.push(line("rad_budget", time, "RADIATION BUDGET",
      `${num(rad.percent_of_limit, 1)} % of ${rad.career_limit_msv} mSv (${rad.agency})`, color));
    entries.push(line("rad_total", time, "RADIATION TOTAL DOSE", `${num(rad.total_msv, 1)} mSv`, color));
    if (rad.solar_event_alert) entries.push(line("rad_spe", time, "SOLAR PARTICLE EVENT", "ACTIVE", t.levelColor("red")));
  }
  if (d.bone_loss_estimate_percent != null) {
    entries.push(line("bone", time, "BONE LOSS ESTIMATE", `${num(d.bone_loss_estimate_percent, 1)} %`, neutral));
  }
  return { key: d.measured_at, entries };
}

/** Latest manual captures (the backend sends them in `manual_latest` on every poll). Pinned, never scrolls away. */
function manualEntries(d, t) {
  const m = d.manual_latest ?? {};
  const out = [];
  const add = (kind, item, label, value) => {
    if (item) out.push(line(`${kind}-${item.captured_at}`, stamp(item.captured_at), label, value, t.levelColor(item.level)));
  };
  const bp = m.blood_pressure;
  add("bp", bp, "BLOOD PRESSURE (MANUAL)", bp && `${num(bp.systolic, 0)}/${num(bp.diastolic, 0)} mmHg`);
  const g = m.glucose;
  add("glucose", g, "GLUCOSE (MANUAL)", g && `${num(g.value, 0)} mg/dL${g.context ? ` (${t.glucoseContext(g.context)})` : ""}`);
  const p = m.phq9;
  add("phq9", p, "PHQ-9", p && `${p.score}/27 (${t.questionnaireSeverity(p.severity)})`);
  if (p?.item9_alert) {
    out.push(line(`item9-${p.captured_at}`, stamp(p.captured_at), "PHQ-9 ITEM 9 ALERT", "thoughts of self-harm", t.levelColor("red")));
  }
  const a = m.gad7;
  add("gad7", a, "GAD-7", a && `${a.score}/21 (${t.questionnaireSeverity(a.severity)})`);
  return out;
}

function Entry({ e }) {
  const head = `· [${e.time}]`;
  return (
    <span className="entry">
      <span className="tag" style={{ color: e.color }}>{COLOR_LABEL ? `${head} ${e.label}:` : head}</span>
      {" "}{!COLOR_LABEL && `${e.label}: `}{e.value}
    </span>
  );
}

/**
 * Terminal-style log of the selected astronaut. Top strip: latest manual captures (pinned).
 * Below: one block per telemetry packet (added only when `measured_at` changes).
 *
 *   <ConsolePanel id={id} name={name} dashboard={data} t={t} stale={false} error={null} />
 */
export default function ConsolePanel({ id, name, dashboard, t, stale, error }) {
  const [logs, setLogs] = useState({}); // astronaut id -> blocks
  const [following, setFollowing] = useState(true);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!id || !dashboard || dashboard.astronaut_id !== id || !dashboard.measured_at) return;
    setLogs((prev) => {
      const list = prev[id] ?? [];
      if (list.some((b) => b.key === dashboard.measured_at)) return prev;
      return { ...prev, [id]: [...list, telemetryBlock(dashboard, t)].slice(-MAX_BLOCKS) };
    });
  }, [id, dashboard?.generated_at, dashboard?.measured_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setFollowing(true), [id]);

  const blocks = logs[id] ?? [];
  useEffect(() => {
    const el = bodyRef.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [blocks.length, following, id]);

  // Following resumes by itself when the person scrolls back to the bottom.
  const onScroll = () => {
    const el = bodyRef.current;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };
  const jump = () => {
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    setFollowing(true);
  };

  const manual = dashboard ? manualEntries(dashboard, t) : [];
  return (
    <section className="console" aria-label="Astronaut telemetry log">
      <header className="console-head">
        <strong>{name ?? "No astronaut selected"}</strong>
        {dashboard && <span style={{ color: t.levelColor(dashboard.level) }}>{t.banner(dashboard.level)}</span>}
        {stale && <span className="stale">{t.ui("staleData")}</span>}
        <button type="button" className="follow" disabled={following} onClick={jump}>Jump to latest</button>
      </header>
      {dashboard && (
        <div className="pinned">
          <span className="hud-label">Manual captures</span>
          <div className="block">
            {manual.length ? manual.map((e) => <Entry key={e.key} e={e} />) : <span className="muted">None recorded yet</span>}
          </div>
        </div>
      )}
      <div className="console-body" ref={bodyRef} onScroll={onScroll}>
        {!id && <p className="muted">Select an astronaut from the list.</p>}
        {id && error && blocks.length === 0 && <p role="alert">{error}</p>}
        {id && !error && blocks.length === 0 && <p className="muted">Waiting for data…</p>}
        {blocks.map((b) => (
          <div className="block" key={b.key}>
            {b.entries.map((e) => <Entry key={e.key} e={e} />)}
          </div>
        ))}
      </div>
    </section>
  );
}
