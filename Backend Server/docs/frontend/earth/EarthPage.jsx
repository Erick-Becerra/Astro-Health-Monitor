import { useState } from "react";
import en from "../shared/i18n-en.json";
import { makeTranslator } from "../shared/i18n.js";
import { usePolling } from "../shared/hooks.js";
import { isStale } from "../shared/monitor.js";
import { describeError } from "../shared/request.js";
import DashboardView from "../shared/DashboardView.jsx";
import AstronautList from "./AstronautList.jsx";
import ThresholdsEditor from "./ThresholdsEditor.jsx";
import { earth } from "./earthApi.js";
import { useNewAlerts } from "./useNewAlerts.js";

const t = makeTranslator(en);

/**
 * The Earth monitoring app (App 1): the list of astronauts every 3 s, the alerts every 3 s, and, for the chosen
 * astronaut, the consolidated view every 3 s. Earth sees the data AFTER the link latency: it is normal that
 * it lags a little behind the astronaut console.
 *
 *   <EarthPage actor="Dr. Rivera" />
 */
export default function EarthPage({ actor }) {
  const [id, setId] = useState(null);
  const [system, setSystem] = useState(null);
  const list = usePolling(() => earth.astronauts(), { seconds: 3 });
  const alerts = useNewAlerts();
  const detail = usePolling(() => earth.dashboard(id), { seconds: 3, enabled: !!id, deps: [id] });
  const rules = usePolling(() => earth.thresholds(id), { seconds: 30, enabled: !!id, deps: [id] });
  const outbox = usePolling(() => earth.outbox({ pendingOnly: true }), { seconds: 5 });

  return (
    <main className="earth">
      <header>
        {alerts.fresh.length > 0 && (
          <button type="button" onClick={alerts.markSeen}>{alerts.fresh.length} {t.ui("newAlerts")}</button>
        )}
        {(outbox.data?.length ?? 0) > 0 && <span>{t.ui("deliveryPending")}: {outbox.data.length}</span>}
        {list.error && <span role="status">{t.ui("connectionLost")}</span>}
      </header>

      {list.loading ? <p>{t.ui("loading")}</p> : (
        <AstronautList astronauts={list.data ?? []} t={t} selectedId={id} onSelect={(next) => { setId(next); setSystem(null); }} />
      )}

      <section className="alerts">
        {alerts.alerts.slice(0, 10).map((a) => (
          <article key={a.id} data-severity={a.severity}>
            <small>{new Date(a.created_at).toLocaleString("en-US")} · {a.name ?? a.astronaut_id}</small>
            <p>{a.summary}</p>
            <p>{a.guidance}</p>
          </article>
        ))}
      </section>

      {id && detail.data && (
        <DashboardView dashboard={detail.data} t={t} selectedSystem={system} onSelectSystem={setSystem}
          stale={isStale(detail.data.measured_at, 60)} />
      )}
      {id && !detail.data && !detail.loading && <p role="alert">{describeError(detail.error)}</p>}

      {id && rules.data && (
        <ThresholdsEditor data={rules.data} t={t} onSave={(patch) => earth.putThresholds(id, patch, actor).then(rules.refresh)} />
      )}
    </main>
  );
}
