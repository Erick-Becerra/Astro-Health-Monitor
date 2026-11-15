import { useMemo, useState } from "react";
import { useT } from "../shared/useT.js";
import SendAlertButton from "./SendAlertButton.jsx";
import SettingsMenu from "./SettingsMenu.jsx";
import { usePolling } from "../shared/hooks.js";
import { isStale } from "../shared/monitor.js";
import DashboardView from "../shared/DashboardView.jsx";
import AlertHistoryModal from "./AlertHistoryModal.jsx";
import WellbeingSection from "./WellbeingSection.jsx";
import AlertFeed from "./AlertFeed.jsx";
import AstronautList from "./AstronautList.jsx";
import { earth } from "./earthApi.js";
import { useNewAlerts } from "./useNewAlerts.js";
import { worst } from "../lib/levels.js";
import { keepLastAstronauts, keepLastDashboard, isSignalAlert, neutralizeSignalLoss, useLastKnown } from "./lastKnown.js";


/**
 * The Earth monitoring app (App 1): the list of astronauts every 3 s, the alerts every 3 s, and, for the chosen
 * astronaut, the consolidated view every 3 s. Earth sees the data AFTER the link latency: it is normal that
 * it lags a little behind the astronaut console.
 *
 *   <EarthPage actor="Dr. Rivera" />
 */
export default function EarthPage({ actor }) {
  const t = useT();
  const [id, setId] = useState(null);
  const [system, setSystem] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const list = usePolling(() => earth.astronauts(), { seconds: 3 });
  // Only the alerts of the astronaut on screen (all of them while none is chosen).
  const alerts = useNewAlerts({ astronautId: id ?? undefined });
  const detail = usePolling(() => earth.dashboard(id), { seconds: 3, enabled: !!id, deps: [id] });
  // A failed or empty answer never wipes the screen: the last value shown stays (see lastKnown.js).
  const known = useLastKnown(list.data, keepLastAstronauts, "list") ?? [];
  // The colour of each astronaut in the list is the one of the server, except when it only comes from a sensor that lost
  // its signal: then it is worked out again from the dashboards (read every 10 s) without that finding.
  const ids = known.map((a) => a.astronaut_id).join(",");
  const everyone = usePolling(() => Promise.all(ids.split(",").map((one) => earth.dashboard(one).catch(() => null))), {
    seconds: 10, enabled: ids !== "", deps: [ids],
  });
  const astronauts = useMemo(() => {
    const dashboards = Object.fromEntries(ids.split(",").map((one, i) => [one, everyone.data?.[i]]));
    return known.map((a) => {
      const d = neutralizeSignalLoss(dashboards[a.astronaut_id]);
      if (!d?.signal_ignored) return a;
      const overall = worst(d.level, a.manual_level);
      return { ...a, overall_level: overall, level: d.level, status: d.status };
    });
  }, [known, everyone.data, ids]);
  const dashboard = useLastKnown(detail.data, keepLastDashboard, id ?? "");
  const profile = astronauts.find((a) => a.astronaut_id === id);

  return (
    <main className="earth">
      <div className="col-left">
        <section className="crew-box" aria-label={t.ui("crewTitle")}>
          <h2 className="hud-label">{t.ui("crewTitle")}</h2>
          {list.loading && !astronauts.length ? <p>{t.ui("loading")}</p> : (
            <AstronautList astronauts={astronauts} t={t} selectedId={id} onSelect={(next) => { setId(next); setSystem(null); }} />
          )}
        </section>

        {/* History of events (not the current advice): the latest alert, and a button for the whole list */}
        <section className="alerts" aria-label={t.ui("alertHistory")}>
          <h2 className="hud-label">{t.ui("latestAlert")}</h2>
          <AlertFeed alerts={alerts.alerts.filter((a) => !isSignalAlert(a))} fallbackName={profile?.name} empty={t.ui("noAlerts")} />
        <button type="button" className="history-button" disabled={!id} onClick={() => setHistoryOpen(true)}>{t.ui("viewHistory")}</button>
        </section>
      </div>
      {historyOpen && id && <AlertHistoryModal astronautId={id} name={profile?.name} t={t} onClose={() => setHistoryOpen(false)} />}

      {!id && (
        <section className="empty-state" aria-live="polite">
          <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.6" />
            <path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6" />
          </svg>
          <h2>{t.ui("selectTitle")}</h2>
          <p>{t.ui("selectText")}</p>
          <span className="empty-arrow" aria-hidden="true">←</span>
        </section>
      )}

      {id && dashboard && (
        <DashboardView dashboard={dashboard} t={t} selectedSystem={system} onSelectSystem={setSystem}
          profile={profile} overviewExtra={<WellbeingSection astronautId={id} answeredBy={profile?.name} />} stale={isStale(dashboard.measured_at, 60)} />
      )}

      {/* Always visible, in every tab: send an alert and the settings */}
      <div className="corner">
        <SendAlertButton astronautId={id} reporter={profile?.name} />
        <SettingsMenu />
      </div>
    </main>
  );
}
