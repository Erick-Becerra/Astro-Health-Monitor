// Client of the EARTH BASE server (port 8000). For the Earth monitoring app (App 1).
// It never calls the station: what the station sends reaches Earth by itself, after the link latency.
import { request, EARTH_URL, qs } from "../shared/request.js";

const get = (path, mock) => request(EARTH_URL, "GET", path, { mock });
const send = (method, path, body, actor) => request(EARTH_URL, method, path, { body, actor });

export const earth = {
  // ---- reads ----
  /** Everyone: name, gender, latest reading and three colours. Use `overall_level` for the home screen. Poll every 3 s. */
  astronauts: () => get("/api/astronauts", "earth/astronauts.json"),
  /** One astronaut: latest reading with findings, profile, personal thresholds, goals, radiation. */
  astronaut: (id) => get(`/api/astronauts/${id}`, `earth/astronaut-${id}.json`),
  /** The consolidated view (8 systems, vitals, radiation, data quality): the same as the astronaut console shows. */
  dashboard: (id) => get(`/api/astronauts/${id}/dashboard`, `earth/dashboard-${id}.json`),
  /**
   * History for charts, oldest first. since / until are ISO times. bucketSeconds averages the readings
   * (use it for ranges over an hour: 300 = one point per 5 min). Each bucket keeps the worst level.
   */
  readings: (id, { since, until, bucketSeconds, limit = 100 } = {}) =>
    get(`/api/astronauts/${id}/readings${qs({ since, until, bucket_seconds: bucketSeconds, limit })}`, `earth/readings-chart-${id}.json`),
  /** Alerts, newest first. `id` always grows: see useNewAlerts. */
  alerts: ({ astronautId, limit = 50 } = {}) => get(`/api/alerts${qs({ astronaut_id: astronautId, limit })}`, astronautId ? `earth/alerts-${astronautId}.json` : "earth/alerts.json"),
  /** Blood pressure, glucose, PHQ-9 / GAD-7 (with item9_alert) and the log, newest first. */
  manual: (id, { kind, limit = 50 } = {}) => get(`/api/astronauts/${id}/manual${qs({ kind, limit })}`, `earth/manual-${id}.json`),
  /** To audit an alert: cabin CO2 series, semaphore history, protocol log. */
  context: (id, { series = 100 } = {}) => get(`/api/astronauts/${id}/context${qs({ series })}`, `earth/context-${id}.json`),
  levelHistory: (id, { limit = 100 } = {}) => get(`/api/astronauts/${id}/level-history${qs({ limit })}`, `earth/level-history-${id}.json`),
  radiation: (id) => get(`/api/astronauts/${id}/radiation`, `earth/radiation-${id}.json`),
  /** Personal thresholds AND the defaults ("adjustable"), so the form can show both. */
  thresholds: (id) => get(`/api/astronauts/${id}/thresholds`, `earth/thresholds-${id}.json`),
  exerciseGoals: (id) => get(`/api/astronauts/${id}/exercise-goals`, `earth/exercise-goals-${id}.json`),
  /** Who changed what and when. Earth shows its own changes and the station's. */
  changes: (params = {}) => get(`/api/changes${qs({ limit: 100, ...params })}`, "earth/changes.json"),
  /** What Earth has sent to the station and whether it arrived (delivered_at). */
  outbox: ({ pendingOnly = false, astronautId, limit = 50 } = {}) =>
    get(`/api/outbox${qs({ pending_only: pendingOnly ? "true" : "", astronaut_id: astronautId, limit })}`, "earth/outbox.json"),
  /** State of the link with the station. */
  link: () => get("/api/station", "earth/station-link.json"),
  variables: () => get("/api/variables", "variables.json"),

  // ---- writes: they travel to the station after the link latency. `actor` = who is editing (change log) ----
  /** Any of: name, gender, birth_date, weight_kg, agency, baseline_hr, baseline_bp_systolic, baseline_bp_diastolic,
   *  dxa_t_score, oct_notes, prior_radiation_msv. What you leave out does not change. */
  putProfile: (id, patch, actor) => send("PUT", `/api/astronauts/${id}`, patch, actor),
  /** { body_temperature: { yellow: 37.3, orange: 37.8, red: 38.3 }, heart_rate: null }  (null = back to the default) */
  putThresholds: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/thresholds`, patch, actor),
  putExerciseGoals: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/exercise-goals`, patch, actor),
  /** kind: note | prescription. severity: info | attention | critical. */
  addNote: (id, { body, kind = "note", severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/notes`, { body, kind, severity }, actor),
  sendMessage: (id, { body, severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/messages`, { body, severity }, actor),
};
