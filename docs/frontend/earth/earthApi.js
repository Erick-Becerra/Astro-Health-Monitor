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
  /** The questionnaires (PHQ-9, GAD-7) an astronaut answered, newest first. Each has `response`: the JSON the front
   *  saved (answers, score, severity, recommendation, who answered...). Filters: questionnaire, answeredBy, since, until. */
  questionnaires: (id, { questionnaire, answeredBy, since, until, limit = 50 } = {}) =>
    get(`/api/astronauts/${id}/questionnaires${qs({ questionnaire, answered_by: answeredBy, since, until, limit })}`, `earth/questionnaires-${id}.json`),
  questionnaire: (id, questionnaireId) => get(`/api/astronauts/${id}/questionnaires/${questionnaireId}`, `earth/questionnaire-${id}.json`),
  /** The same for EVERY astronaut (add astronautId to narrow it down). */
  allQuestionnaires: ({ astronautId, questionnaire, answeredBy, since, until, limit = 50 } = {}) =>
    get(`/api/questionnaires${qs({ astronaut_id: astronautId, questionnaire, answered_by: answeredBy, since, until, limit })}`, "earth/questionnaires.json"),
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
  /** What the astronaut reported ("something hurts"), newest first, with the vitals of that moment. Each report also
   *  raised an alert. Filters: severity, symptom, since, until. Without `id`: every astronaut. */
  symptomReports: (id, { severity, symptom, since, until, limit = 50 } = {}) =>
    get(id ? `/api/astronauts/${id}/symptom-reports${qs({ severity, symptom, since, until, limit })}`
           : `/api/symptom-reports${qs({ severity, symptom, since, until, limit })}`, `earth/symptom-reports-${id ?? "all"}.json`),
  /** Record files (CSV) of an astronaut, newest first, WITHOUT their contents. The first one is the current record.
   *  Not shown by default: call it only when the user opens the record. */
  records: (id) => get(`/api/astronauts/${id}/records`, `earth/records-${id}.json`),
  /** The CSV as a table: { columns, rows, total, offset }. `fileId` is a number or "latest". */
  recordRows: (id, fileId = "latest", { offset = 0, limit = 100 } = {}) =>
    get(`/api/astronauts/${id}/records/${fileId}/rows${qs({ offset, limit })}`, `earth/record-rows-${id}.json`),
  /** Address to download the file as it was uploaded: <a href={earth.recordUrl(id)} download>. */
  recordUrl: (id, fileId = "latest") => `${EARTH_URL}/api/astronauts/${id}/records/${fileId}/download`,

  // ---- writes: they travel to the station after the link latency. `actor` = who is editing (change log) ----
  /** Any of: name, gender, birth_date, weight_kg, agency, baseline_hr, baseline_bp_systolic, baseline_bp_diastolic,
   *  dxa_t_score, oct_notes, prior_radiation_msv. What you leave out does not change. */
  /** Delete the astronaut and everything that hangs from it (cannot be undone). Ask the user to confirm first. */
  deleteAstronaut: (id, actor) => send("DELETE", `/api/astronauts/${id}?confirm=true`, undefined, actor),
  putProfile: (id, patch, actor) => send("PUT", `/api/astronauts/${id}`, patch, actor),
  /** { body_temperature: { yellow: 37.3, orange: 37.8, red: 38.3 }, heart_rate: null }  (null = back to the default) */
  putThresholds: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/thresholds`, patch, actor),
  putExerciseGoals: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/exercise-goals`, patch, actor),
  /** kind: note | prescription. severity: info | attention | critical. */
  /** Upload the record: `file` is the File of an <input type="file" accept=".csv">. Each upload is a new version. */
  uploadRecord: (id, file, actor, note) => {
    const form = new FormData();
    form.append("file", file);
    if (note) form.append("note", note);
    return send("POST", `/api/astronauts/${id}/records`, form, actor);
  },
  addNote: (id, { body, kind = "note", severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/notes`, { body, kind, severity }, actor),
  sendMessage: (id, { body, severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/messages`, { body, severity }, actor),
};
