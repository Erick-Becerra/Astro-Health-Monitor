import { useState } from "react";
import en from "../shared/i18n-en.json";
import { makeTranslator } from "../shared/i18n.js";
import { usePolling } from "../shared/hooks.js";
import { isStale } from "../shared/monitor.js";
import { describeError } from "../shared/request.js";
import DashboardView from "../shared/DashboardView.jsx";
import ManualInputs from "./ManualInputs.jsx";
import { station } from "./stationApi.js";

const t = makeTranslator(en);

/**
 * The astronaut console (App 2): one dashboard call every 2 s, the link every 5 s, the inbox every 5 s.
 * It talks only to the station, so it keeps working if Earth is down.
 *
 *   <ConsolePage astronautId="AST-01" actor="Lucía Fernández" />
 */
export default function ConsolePage({ astronautId, actor }) {
  const [system, setSystem] = useState(null);
  const dash = usePolling(() => station.dashboard(astronautId), { seconds: 2, deps: [astronautId] });
  const link = usePolling(() => station.status(), { seconds: 5 });
  const inbox = usePolling(() => station.messages(astronautId, { unreadOnly: true }), { seconds: 5, deps: [astronautId] });

  if (dash.loading) return <p>{t.ui("loading")}</p>;
  if (!dash.data) return <p role="alert">{describeError(dash.error)}</p>; // 404 = no data for this astronaut yet

  return (
    <main className="console">
      <p className="link-state" data-up={link.data?.link_up ?? "unknown"}>
        {link.data?.link_up === false ? t.ui("offlineMode") : t.ui("liveTelemetry")}
        {link.data && ` · ${t.ui("earthLatency")}: ${link.data.link_delay_seconds} s`}
      </p>
      {dash.error && <p className="warning" role="status">{t.ui("connectionLost")}</p>}

      <DashboardView dashboard={dash.data} t={t} selectedSystem={system} onSelectSystem={setSystem}
        stale={isStale(dash.data.measured_at, 15)} />

      <section className="inbox">
        {(inbox.data ?? []).map((m) => (
          <article key={m.id} data-severity={m.severity}>
            <small>{t.messageKind(m.kind)} · {t.severity(m.severity)}</small>
            <p>{m.body}</p>
            <button type="button" onClick={() => station.ackMessage(m.id)}>OK</button>
          </article>
        ))}
      </section>

      <ManualInputs astronautId={astronautId} actor={actor} t={t} onSaved={dash.refresh} />
    </main>
  );
}
