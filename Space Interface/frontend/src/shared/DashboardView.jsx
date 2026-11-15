import { useLayoutEffect, useMemo, useRef, useState } from "react";
import BodyDiagram from "../components/BodyDiagram.jsx";
import { FOCUS_REGIONS, regionFlags, regionSystem } from "../lib/bodyFlags.js";
import { QUESTIONNAIRES } from "../lib/questionnaires.js";
import { buildCards, show } from "./monitor.js";

export default function DashboardView({ dashboard, t, selectedSystem, onSelectSystem, stale = false, profile, overviewExtra = null }) {
  const focus = dashboard.systems.find((s) => s.system === selectedSystem) ?? null;
  const focusRegions = focus ? FOCUS_REGIONS[focus.system] ?? [] : [];
  const all = useMemo(() => regionFlags(dashboard.systems).flags, [dashboard.systems]);
  const flags = useMemo(
    () => {
      if (!focus) return all;
      const own = Object.fromEntries(Object.entries(all).filter(([region]) => focusRegions.includes(region)));

      if (focus.system === "thermal" && focus.level && focus.level !== "green") own.thermal = focus.level;
      return own;
    },
    [all, focus],
  );
  const vitals = useMemo(() => {
    const value = (key) => dashboard.vitals.find((v) => v.key === key)?.value ?? null;
    return {
      heart_rate: value("heart_rate"),
      body_temperature: value("body_temperature"),
      blood_pressure_systolic: value("blood_pressure_systolic"),
      blood_pressure_diastolic: value("blood_pressure_diastolic"),
    };
  }, [dashboard.vitals]);
  const pickRegion = (region) => {
    const system = region && regionSystem(region);
    if (!system) return onSelectSystem?.(null);
    if (dashboard.systems.some((s) => s.system === system)) onSelectSystem?.(system === focus?.system ? null : system);
    return undefined;
  };
  return (
    <div className="dashboard">
      <aside className="side">
        <section className="body-frame" data-level={dashboard.level}>
          <header>
            <div>
              <h2>{profile?.name ?? dashboard.astronaut_id}</h2>
              <p className="sub">{dashboard.astronaut_id}{profile?.gender && ` · ${t.gender(profile.gender)}`}</p>
            </div>
            <span className="badge">{t.status(dashboard.status)}</span>
          </header>
          <BodyDiagram gender={profile?.gender ?? "male"} t={t} flags={flags} vitals={vitals}
                       selected={focusRegions} onSelect={pickRegion} />
        </section>

        <nav className="system-map" aria-label={t.ui("systemsAria")}>
          <button type="button" data-level={dashboard.level} aria-pressed={!focus} onClick={() => onSelectSystem?.(null)}>
            <span className="dot" style={{ background: t.levelColor(dashboard.level) }} />
            {t.ui("overview")}
          </button>
          {dashboard.systems.map((s) => (
            <button key={s.system} type="button" data-level={s.level} aria-pressed={s.system === focus?.system}
                    onClick={() => onSelectSystem?.(s.system)}>
              <span className="dot" style={{ background: t.levelColor(s.level) }} />
              <span title={t.system(s.system)}>{t.system(s.system, "short")}</span>
            </button>
          ))}
        </nav>
      </aside>

      {focus ? (
        <SystemPanel system={focus} dashboard={dashboard} t={t} />
      ) : (
        <div className="overview">
          <h2 className="overview-title">{t.ui("overview")}</h2>
          <section className="cards" aria-label={t.ui("cardsAria")}>
            {buildCards(dashboard).map((card) => (
              <button key={card.id} type="button" className="card" data-level={card.level ?? "unknown"}
                      onClick={() => onSelectSystem?.(card.system)}>
                <span className="dot" style={{ background: t.levelColor(card.level) }} />
                <span className="title">{t.card(card.id)}</span>
                <strong className="value">{cardValue(card, t)}</strong>
                <small className="level">{card.noSignal ? t.ui("noSignal") : (t.dict.cardStates[card.level ?? "unknown"] ?? t.dict.cardStates.unknown).toUpperCase()}</small>
              </button>
            ))}
          </section>

          <RadiationMeter radiation={dashboard.radiation} level={dashboard.systems.find((s) => s.system === "radiation")?.level} t={t} />

          {overviewExtra}

          {dashboard.data_quality.length > 0 && (
            <ul className="data-quality">
              {dashboard.data_quality.map((q) => (
                <li key={q.group} data-quality={q.quality}>
                  {t.sensorGroup(q.group)}: {t.signalQuality(q.quality)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function cardValue(card, t) {
  const v = card.values;
  switch (card.id) {
    case "sleep": return `${show(v.hours, 1)} h`;
    case "mood":
      return (
        <>
          P:{show(v.phq9)}<small className="scale">/{QUESTIONNAIRES.phq9.max}</small> | G:{show(v.gad7)}<small className="scale">/{QUESTIONNAIRES.gad7.max}</small>
        </>
      );
    case "heart_rate": return `${show(v.bpm)} ${t.unit("heart_rate")}`;
    case "blood_pressure": return `${show(v.systolic)}/${show(v.diastolic)}`;
    case "temperature": return `${show(v.celsius, 1)} °C`;
    case "radiation": return `${show(v.percent)}% (${show(v.totalMsv)})`;
    case "glucose": return `${show(v.mgdl)} mg/dL`;
    default: return "";
  }
}

const MIN_ROOM = 150;

function SystemPanel({ system, dashboard, t }) {
  const advice = dashboard.guides.filter((g) => system.drivers.some((d) => d.indicator === g.id));
  const general = t.system(system.system, "general");
  const tips = Array.isArray(general) ? general : [];

  const panel = useRef(null);
  const top = useRef(null);
  const [room, setRoom] = useState(0);
  const [manual, setManual] = useState(null);
  useLayoutEffect(() => setManual(null), [system.system]);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return undefined;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
      setRoom(Math.round(el.clientHeight - pad - top.current.offsetHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(top.current);
    return () => observer.disconnect();
  }, [system.system, system.drivers.length, advice.length]);
  const needed = 40 + tips.length * 36;
  const open = manual ?? room >= Math.max(MIN_ROOM, needed);

  return (
    <section className="system-panel" data-level={system.level} ref={panel}>
      <div className="sp-top" ref={top}>
        <h2>{t.system(system.system)}</h2>
        <p>{t.system(system.system, "description")}</p>
        <dl>
          <dt>{t.ui("hazard")}</dt>
          <dd>{t.hazard(system.hazard)}</dd>
          <dt>{t.ui("hardware")}</dt>
          <dd>{t.system(system.system, "hardware")}</dd>
        </dl>
        {system.drivers.length === 0 ? (
          <p className="muted">{t.ui("noDrivers")}</p>
        ) : (
          <ul className="drivers">
            {system.drivers.map((d) => (
              <li key={d.indicator} data-level={d.level}>
                <span className="dot" style={{ background: t.levelColor(d.level) }} />
                {t.indicator(d.indicator)}: <strong>{String(d.value)}</strong> {t.unit(d.indicator)}
              </li>
            ))}
          </ul>
        )}
        <div className="protocol" data-level={system.level}>
          <h3>{t.ui("recommendedAction")}</h3>
          <p>{t.protocol(system.level)}</p>
          {advice.map((g) => <p key={g.id} className="advice">{g.steps.join(" ")}</p>)}
        </div>
        <div className="physiology">
          <h3>{t.ui("physiology")}</h3>
          <p>{t.system(system.system, "physiology")}</p>
        </div>
      </div>

      {tips.length > 0 && (
        <div className={`general${open ? " is-open" : ""}`}>
          <button type="button" className="general-head" aria-expanded={open} onClick={() => setManual(!open)}>
            <span>{t.ui("generalAdvice")}</span>
            <small>{t.ui("generalAdviceNote")}</small>
            <span className="chevron" aria-hidden="true">{open ? "\u25B2" : "\u25BC"}</span>
          </button>
          {open && (
            <ul className="general-body">
              {tips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function RadiationMeter({ radiation, level, t }) {
  if (!radiation) return null;
  const pct = Math.min(100, Math.max(0, radiation.percent_of_limit ?? 0));
  return (
    <section className="radiation-meter" data-level={level}>
      <h3>{t.ui("radiationBudget")}</h3>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="fill" style={{ width: `${pct}%`, background: t.levelColor(level) }} />
      </div>
      <p>{show(radiation.percent_of_limit, 1)}% {t.ui("ofCareerLimit")} · {show(radiation.total_msv)} {t.ui("of")} {radiation.career_limit_msv} mSv ({radiation.agency ?? "—"})</p>
      {radiation.solar_event_alert && <p className="solar-alert">{t.ui("solarEventAlert")}</p>}
    </section>
  );
}
