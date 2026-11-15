import { buildCards, show } from "./monitor.js";

/**
 * The monitor screen drawn from a dashboard (station: GET /api/crew/{id}/dashboard,
 * Earth: GET /api/astronauts/{id}/dashboard). It only paints: every colour is the `level` the backend sent.
 * It has no styles on purpose (only the colour of each level): give it yours through the class names and
 * the data-level attributes. Copy it and change it freely; it is a starting point.
 *
 *   <DashboardView dashboard={data} t={t} selectedSystem={sys} onSelectSystem={setSys} stale={isStale(data.measured_at)} />
 */
export default function DashboardView({ dashboard, t, selectedSystem, onSelectSystem, stale = false }) {
  const selected = dashboard.systems.find((s) => s.system === selectedSystem) ?? dashboard.systems[0];
  return (
    <div className="dashboard">
      <header className="crew-status" data-level={dashboard.level}>
        <span className="label">{t.ui("crewStatus")}</span>
        <strong style={{ color: t.levelColor(dashboard.level) }}>{t.banner(dashboard.level)}</strong>
        {dashboard.environment?.crew_state && <span>{t.crewState(dashboard.environment.crew_state)}</span>}
        {stale && <span className="stale">{t.ui("staleData")}</span>}
      </header>

      <nav className="system-map" aria-label="Sistemas">
        {dashboard.systems.map((s) => (
          <button key={s.system} type="button" data-level={s.level} aria-pressed={s.system === selected.system}
                  onClick={() => onSelectSystem?.(s.system)}>
            <span className="dot" style={{ background: t.levelColor(s.level) }} />
            {t.system(s.system)}
          </button>
        ))}
      </nav>

      <SystemPanel system={selected} dashboard={dashboard} t={t} />

      <section className="cards" aria-label="Integrated telemetry log">
        {buildCards(dashboard).map((card) => (
          <button key={card.id} type="button" className="card" data-level={card.level ?? "unknown"}
                  onClick={() => onSelectSystem?.(card.system)}>
            <span className="dot" style={{ background: t.levelColor(card.level) }} />
            <span className="title">{t.card(card.id)}</span>
            <strong className="value">{cardValue(card, t)}</strong>
            <small className="level">{card.noSignal ? t.ui("noSignal") : t.level(card.level).toUpperCase()}</small>
          </button>
        ))}
      </section>

      <RadiationMeter radiation={dashboard.radiation} level={dashboard.systems.find((s) => s.system === "radiation")?.level} t={t} />

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
  );
}

/** What each card shows as its main value. */
function cardValue(card, t) {
  const v = card.values;
  switch (card.id) {
    case "sleep": return `${show(v.hours, 1)} h`;
    case "mood": return `P:${show(v.phq9)} | G:${show(v.gad7)}`;
    case "heart_rate": return `${show(v.bpm)} ${t.unit("heart_rate")}`;
    case "blood_pressure": return `${show(v.systolic)}/${show(v.diastolic)}`;
    case "temperature": return `${show(v.celsius, 1)} °C`;
    case "radiation": return `${show(v.percent)}% (${show(v.totalMsv)})`;
    case "glucose": return `${show(v.mgdl)} mg/dL`;
    default: return "";
  }
}

function SystemPanel({ system, dashboard, t }) {
  // The advice sentences of the backend are in English for now; the protocol of the level is in English.
  const advice = dashboard.guides.filter((g) => system.drivers.some((d) => d.indicator === g.id));
  return (
    <section className="system-panel" data-level={system.level}>
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
        {advice.map((g) => (
          <div key={g.id} className="advice" data-level={g.level}>
            <p><strong>{g.level_name}</strong>: {g.message}</p>
            {g.action && <p>{g.action}</p>}
            {g.steps?.length > 0 && <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          </div>
        ))}
      </div>
      <div className="physiology">
        <h3>{t.ui("physiology")}</h3>
        <p>{t.system(system.system, "physiology")}</p>
      </div>
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
      <p>{show(radiation.percent_of_limit, 1)}% · {show(radiation.total_msv)} {t.ui("of")} {radiation.career_limit_msv} mSv ({radiation.agency ?? "—"})</p>
      {radiation.solar_event_alert && <p className="solar-alert">{t.ui("solarEventAlert")}</p>}
    </section>
  );
}
