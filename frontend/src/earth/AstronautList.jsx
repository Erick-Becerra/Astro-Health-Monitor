import { show } from "../shared/monitor.js";

/**
 * The home screen of Earth: every astronaut, the worst first. The colour is `overall_level`
 * (sensors + manual captures + symptoms + radiation: the same colour the astronaut console shows).
 *
 *   <AstronautList astronauts={data} t={t} selectedId={id} onSelect={setId} />
 */
export default function AstronautList({ astronauts, t, selectedId, onSelect }) {
  const sorted = [...astronauts].sort(
    (a, b) => t.levelOrder(b.overall_level) - t.levelOrder(a.overall_level) || a.astronaut_id.localeCompare(b.astronaut_id),
  );
  return (
    <ul className="astronaut-list">
      {sorted.map((a) => (
        <li key={a.astronaut_id}>
          <button type="button" data-level={a.overall_level ?? "unknown"} aria-pressed={a.astronaut_id === selectedId}
                  onClick={() => onSelect?.(a.astronaut_id)}>
            <span className="dot" style={{ background: t.levelColor(a.overall_level) }} />
            <strong>{a.name ?? a.astronaut_id}</strong>
            {a.gender && <small>{t.gender(a.gender)}</small>}
            <span className="badge">{t.badge(a.overall_level).split(" // ").pop()}</span>
            {a.latest ? (
              <span className="latest">
                {show(a.latest.heart_rate)} {t.unit("heart_rate")} · {show(a.latest.body_temperature, 1)} °C
                {a.latest.crew_state && ` · ${t.crewState(a.latest.crew_state)}`}
              </span>
            ) : (
              <span className="latest">{t.level(null)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
