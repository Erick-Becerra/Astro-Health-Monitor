import { useState } from "react";
import en from "../shared/i18n-en.json";
import { makeTranslator } from "../shared/i18n.js";
import { usePolling } from "../shared/hooks.js";
import { isStale } from "../shared/monitor.js";
import { describeError } from "../shared/request.js";
import AstronautList from "./AstronautList.jsx";
import ConsolePanel from "./ConsolePanel.jsx";
import NewAstronautForm from "./NewAstronautForm.jsx";
import RecordPanel from "./RecordPanel.jsx";
import RecordSummary from "./RecordSummary.jsx";
import SymptomPanel from "./SymptomPanel.jsx";
import ReportBar from "./ReportBar.jsx";
import { earth } from "./earthApi.js";
import { useNewAlerts } from "./useNewAlerts.js";

const t = makeTranslator(en);
const ALERT_LIMIT = 200;
const formatDateTime = (iso) => new Date(iso).toLocaleString("en-GB");

/**
 * The Earth monitoring app (App 1). Left: crew list. Center: report bar + telemetry console.
 * Right: scrollable alert feed. Earth sees the data AFTER the link latency.
 *
 *   <EarthPage actor="Dr. Rivera" />
 */
export default function EarthPage({ actor }) {
  const [id, setId] = useState(null);
  const [form, setForm] = useState(null); // "new" | "edit" | null
  const [showRecord, setShowRecord] = useState(false);
  const [tab, setTab] = useState("telemetry"); // "telemetry" | "symptoms"
  const list = usePolling(() => earth.astronauts(), { seconds: 3 });
  const alerts = useNewAlerts({ limit: ALERT_LIMIT });
  const detail = usePolling(() => earth.dashboard(id), { seconds: 3, enabled: !!id, deps: [id] });
  const profile = usePolling(() => earth.astronaut(id), { seconds: 30, enabled: !!id, deps: [id] });
  const records = usePolling(() => earth.records(id), { seconds: 30, enabled: !!id, deps: [id] });
  const symptoms = usePolling(() => earth.symptomReports(id), { seconds: 10, enabled: !!id, deps: [id] });
  const outbox = usePolling(() => earth.outbox({ pendingOnly: true }), { seconds: 5 });

  const selected = (list.data ?? []).find((a) => a.astronaut_id === id);
  const name = selected?.name ?? id;
  const dashboard = detail.data?.astronaut_id === id ? detail.data : null;
  const pending = outbox.data?.length ?? 0;
  const symptomCount = Array.isArray(symptoms.data) ? symptoms.data.length : 0;

  // Opens the printable report in a new tab (where "Save as PDF" lives).
  const handleGenerate = ({ astronautId, start, end }) => {
    window.open(`/earth/report?astronaut=${encodeURIComponent(astronautId)}&from=${start}&to=${end}`, "_blank");
  };

  return (
    <main className="earth">
      {(pending > 0 || list.error) && (
        <header className="topline">
          {pending > 0 && <span>{t.ui("deliveryPending")}: {pending}</span>}
          {list.error && <span role="status">{t.ui("connectionLost")}</span>}
        </header>
      )}

      <aside className="crew">
        <div className="crew-head">
          <span className="hud-label">Crew</span>
          <button type="button" onClick={() => setForm("new")}>+ New astronaut</button>
        </div>
        {list.loading ? <p>{t.ui("loading")}</p> : (
          <AstronautList
            astronauts={list.data ?? []} t={t} selectedId={id} onSelect={setId}
            renderDetails={() => (
              <RecordSummary
                profile={profile.data?.astronaut_id === id ? profile.data.profile : null}
                records={records.data} t={t}
                onOpenRecord={() => setShowRecord(true)} onEdit={() => setForm("edit")}
              />
            )}
          />
        )}
      </aside>

      <section className="center">
        <ReportBar astronautId={id} astronautName={name} firstSeen={selected?.first_seen} onGenerate={handleGenerate} />
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "telemetry"} onClick={() => setTab("telemetry")}>Telemetry</button>
          <button type="button" role="tab" aria-selected={tab === "symptoms"} onClick={() => setTab("symptoms")}>
            Symptoms{symptomCount > 0 && <span className="count">{symptomCount}</span>}
          </button>
        </div>
        <div className="tab-pane" hidden={tab !== "telemetry"}>
          <ConsolePanel
            id={id} name={id ? name : null} dashboard={dashboard} t={t}
            stale={!!dashboard && isStale(dashboard.measured_at, 60)}
            error={id && !dashboard && !detail.loading ? describeError(detail.error) : null}
          />
        </div>
        <div className="tab-pane" hidden={tab !== "symptoms"}>
          <SymptomPanel
            name={id ? name : null} t={t} loading={symptoms.loading}
            reports={symptoms.data?.length !== undefined ? symptoms.data : null}
            error={id && !symptoms.data && !symptoms.loading ? describeError(symptoms.error) : null}
          />
        </div>
      </section>

      <aside className="feed">
        <div className="feed-head">
          <h2>Alerts</h2>
          {alerts.fresh.length > 0 && (
            <button type="button" onClick={alerts.markSeen}>{alerts.fresh.length} {t.ui("newAlerts")}</button>
          )}
        </div>
        <div className="feed-scroll">
          {alerts.alerts.slice(0, ALERT_LIMIT).map((a) => (
            <article key={a.id} data-severity={a.severity}>
              <small>{formatDateTime(a.created_at)} · {a.name ?? a.astronaut_id}</small>
              <p>{a.summary}</p>
              <p>{a.guidance}</p>
            </article>
          ))}
        </div>
      </aside>

      {form && (
        <NewAstronautForm
          mode={form} actor={actor} existingIds={(list.data ?? []).map((a) => a.astronaut_id)}
          initial={form === "edit" ? { astronaut_id: id, ...(profile.data?.profile ?? {}), ...(profile.data?.exercise_goals ?? {}) } : {}}
          onClose={() => setForm(null)}
          onSaved={(savedId) => {
            setForm(null);
            setId(savedId);
            list.refresh(); profile.refresh(); records.refresh(); outbox.refresh();
          }}
        />
      )}
      {showRecord && id && (
        <RecordPanel id={id} name={name} actor={actor} onClose={() => setShowRecord(false)} onChanged={() => records.refresh()} />
      )}
    </main>
  );
}
