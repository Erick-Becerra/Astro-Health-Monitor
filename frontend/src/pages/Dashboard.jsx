import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { describeError } from "../api.js";
import { needsBackend, useConnection } from "../connection.js";
import { usePolling, usePollingMany } from "../hooks/usePolling.js";
import { useProfiles } from "../hooks/useProfiles.js";
import BodyDiagram from "../components/BodyDiagram.jsx";
import CrewTabs from "../components/CrewTabs.jsx";
import Frame from "../components/Frame.jsx";
import HistoryDialog from "../components/HistoryDialog.jsx";
import Inbox from "../components/Inbox.jsx";
import OfflineView from "../components/OfflineView.jsx";
import QuestionnaireDialog from "../components/QuestionnaireDialog.jsx";
import SystemsPanel from "../components/SystemsPanel.jsx";
import VitalCards from "../components/VitalCards.jsx";
import VitalsChart from "../components/VitalsChart.jsx";
import WellbeingPanel from "../components/WellbeingPanel.jsx";
import { regionFlags, regionSystem } from "../lib/bodyFlags.js";
import { REGIONS } from "../lib/bodyRegions.js";
import { buildCards } from "../lib/cards.js";
import { ago, BANNER_TEXT, isStale, LEVEL_TEXT } from "../lib/levels.js";
import { QUESTIONNAIRES } from "../lib/questionnaires.js";

const TREND = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm" },
  { key: "body_temperature", label: "Temperature", unit: "°C" },
  { key: "blood_pressure_systolic", label: "Systolic pressure", unit: "mmHg" },
  { key: "spo2", label: "Oxygen saturation", unit: "%" },
];

const labelOf = (region) => REGIONS.find((r) => r.id === region)?.label ?? region;

// A sensor without a signal gives null, never an old number.
const vitalValue = (dashboard, key) => {
  const vital = dashboard?.vitals?.find((v) => v.key === key);
  return vital && !vital.no_signal ? vital.value : null;
};

export default function Dashboard() {
  const { id } = useParams();
  const [region, setRegion] = useState(null);
  const [metric, setMetric] = useState(TREND[0]);
  const [dialog, setDialog] = useState(null); // { type: "form", questionnaire } or { type: "history" }
  const [now, setNow] = useState(Date.now);
  useEffect(() => setRegion(null), [id]);
  useEffect(() => setDialog(null), [id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000); // keeps the 24 h reminders current
    return () => clearInterval(timer);
  }, []);

  // Everything on screen comes from the station server.
  const station = usePolling("/api/status", 5000);
  const ids = useMemo(() => station.data?.crew ?? [], [station.data]);
  const profiles = useProfiles(ids);
  // The astronaut on screen is read every 2 s; the others only feed the tab dots, so every 10 s.
  const current = usePolling(id ? `/api/crew/${id}/dashboard` : null, 2000);
  const dashboards = usePollingMany(ids, (crewId) => `/api/crew/${crewId}/dashboard`, 10000);
  const readings = usePolling(id ? `/api/readings?astronaut_id=${id}&limit=100` : null, 5000);
  const inbox = usePolling(id ? `/api/messages?astronaut_id=${id}&unread_only=true` : null, 5000);
  const surveys = usePolling(id ? `/api/crew/${id}/questionnaires?limit=50` : null, 30000);

  const { down } = useConnection();
  const dashboard = current.data ?? dashboards.data?.[id];
  const { flags, reasons } = useMemo(() => regionFlags(dashboard?.systems), [dashboard]);
  const cards = useMemo(() => (dashboard ? buildCards(dashboard) : []), [dashboard]);
  const bodyVitals = useMemo(
    () => ({
      heart_rate: vitalValue(dashboard, "heart_rate"),
      body_temperature: vitalValue(dashboard, "body_temperature"),
      blood_pressure_systolic: vitalValue(dashboard, "blood_pressure_systolic"),
      blood_pressure_diastolic: vitalValue(dashboard, "blood_pressure_diastolic"),
    }),
    [dashboard]
  );
  const history = useMemo(() => [...(readings.data ?? [])].reverse(), [readings.data]);

  // No connection and nothing received yet: show the empty screen (the floating
  // warning explains why). It fills in by itself when the backend answers.
  if (station.error && !station.data) return <OfflineView />;
  if (!station.data) return <section className="page muted">Connecting to the station…</section>;
  if (!ids.length) {
    return (
      <section className="page">
        <h1>Astro Health Monitor</h1>
        <p className="muted">The station has no astronauts registered yet.</p>
      </section>
    );
  }
  if (!ids.includes(id)) return <Navigate to={`/astronaut/${ids[0]}`} replace />;

  const profile = profiles[id];
  const crew = ids.map((crewId) => ({
    id: crewId,
    name: profiles[crewId]?.name ?? crewId,
    level: dashboards.data?.[crewId]?.level ?? null,
  }));

  const stale = dashboard ? isStale(dashboard.measured_at) : false;
  const system = dashboard?.systems?.find((s) => s.system === regionSystem(region));
  const steps = (dashboard?.guides ?? []).filter((g) => system?.drivers?.some((d) => d.indicator === g.id));
  const guidance = (dashboard?.guides ?? []).filter((g) => g.level && g.level !== "green");

  const surveyRows = surveys.data;

  const body = (
    <Frame
      area="body"
      className="frame-body"
      title={profile?.name ?? id}
      aside={dashboard && <span className={`level-tag level-${dashboard.level}`}>{LEVEL_TEXT[dashboard.level]}</span>}
    >
      <p className="muted frame-sub">
        {id} · {profile?.gender ?? "loading profile"}
      </p>
      <div className="scene">
        <BodyDiagram
          gender={profile?.gender ?? "male"}
          flags={flags}
          selected={region}
          onSelect={setRegion}
          vitals={bodyVitals}
        />
      </div>
      <div className="chips" role="group" aria-label="Body parts">
        {REGIONS.filter((r) => r.id !== "skin").map((r) => (
          <button
            key={r.id}
            type="button"
            className={`chip${flags[r.id] ? ` chip-flag flag-${flags[r.id]}` : ""}`}
            aria-pressed={region === r.id}
            onClick={() => setRegion(region === r.id ? null : r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="scene-note">
        {region ? (
          <>
            <strong>{labelOf(region)}</strong>
            {system ? (
              <>
                <p>
                  <span className={`level-tag level-${system.level}`}>{LEVEL_TEXT[system.level]}</span>{" "}
                  {system.label} · NASA hazard: {system.hazard}
                </p>
                {reasons[region]?.length > 0 && (
                  <ul className="reasons">
                    {[...new Set(reasons[region])].map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                )}
                {steps.map((guide) => (
                  <p key={guide.id}>
                    <b>{guide.title}:</b> {guide.steps.join(" ")}
                  </p>
                ))}
              </>
            ) : (
              <p>This area has no system of its own. Pick an organ or a system to see its status.</p>
            )}
          </>
        ) : (
          <p>Colours come from the station. Click a part of the body to see why.</p>
        )}
      </div>
    </Frame>
  );

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <h1>Crew health</h1>
          <h2 className="subtitle">Real-time health monitoring for your crew</h2>
        </div>
        <p className={`pill ${station.data.link_up && !down ? "pill-ok" : "pill-bad"}`}>
          <span className="dot" aria-hidden="true" />
          {down
            ? "No connection to the station · showing the last data"
            : station.data.link_up
              ? `Live telemetry · ${station.data.link_delay_seconds} s delay`
              : "Offline mode: the link with Earth is down"}
        </p>
      </header>

      <CrewTabs crew={crew} />

      {!dashboard ? (
        <p className="muted">
          {current.error ? describeError(current.error) : "Loading the dashboard…"}
        </p>
      ) : (
        <div className="grid">
          <section className={`banner level-${dashboard.level}`} style={{ gridArea: "banner" }}>
            <strong>{BANNER_TEXT[dashboard.level]}</strong>
            <span>
              {dashboard.environment?.crew_state ?? "–"} · mission day {dashboard.environment?.mission_day ?? "–"}
            </span>
            {stale && (
              <span className="banner-warning">
                NO RECENT DATA · last reading {ago(dashboard.measured_at)}
              </span>
            )}
            {dashboard.data_quality?.length > 0 && (
              <span className="banner-warning">Sensor problems: {dashboard.data_quality.length}</span>
            )}
          </section>

          {body}

          <Frame area="cards" title="Vital signs">
            <VitalCards cards={cards} />
          </Frame>

          <Frame
            area="chart"
            title="Recent trend"
            aside={
              <div className="seg" role="group" aria-label="Vital sign shown in the chart">
                {TREND.map((m) => (
                  <button key={m.key} type="button" aria-pressed={m.key === metric.key} onClick={() => setMetric(m)}>
                    {m.label}
                  </button>
                ))}
              </div>
            }
          >
            {history.length ? <VitalsChart readings={history} metric={metric} /> : <p className="muted">No readings yet.</p>}
          </Frame>

          <div className="side" style={{ gridArea: "side" }}>
            <Frame title="Wellbeing questionnaires">
              <WellbeingPanel
                rows={surveyRows}
                now={now}
                onAnswer={needsBackend((questionnaire) => setDialog({ type: "form", questionnaire }))}
                onHistory={needsBackend(() => setDialog({ type: "history" }))}
              />
              {surveys.error && !surveyRows && <p className="notice">{describeError(surveys.error)}</p>}
            </Frame>
            <Frame title="Systems">
              <SystemsPanel systems={dashboard.systems ?? []} selectedSystem={regionSystem(region)} onSelect={setRegion} />
            </Frame>
            <Frame title="What to do">
              {guidance.length ? (
                <ul className="guides">
                  {guidance.map((guide) => (
                    <li key={guide.id} className={`level-${guide.level}`}>
                      <strong>{guide.title}</strong>
                      {guide.steps.map((step) => (
                        <p key={step}>{step}</p>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nothing to act on right now.</p>
              )}
            </Frame>
            <Frame title="Messages from Earth">
              <Inbox messages={inbox.data ?? []} onChanged={inbox.refresh} />
            </Frame>
          </div>
        </div>
      )}

      {dialog?.type === "form" && (
        <QuestionnaireDialog
          key={dialog.questionnaire}
          definition={QUESTIONNAIRES[dialog.questionnaire]}
          astronautId={id}
          answeredBy={profile?.name ?? id}
          onClose={() => setDialog(null)}
          onSaved={surveys.refresh}
        />
      )}
      {dialog?.type === "history" && (
        <HistoryDialog rows={surveyRows} error={surveys.error} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
