// Client of the SPACE STATION server (port 8001). For the astronaut console (App 2) and the simulator (App 3).
// The console never calls the Earth server: it has to work with no link to Earth.
import { request, STATION_URL, qs } from "../shared/request.js";

const get = (path, mock) => request(STATION_URL, "GET", path, { mock });
const send = (method, path, body, actor) => request(STATION_URL, method, path, { body, actor });

export const station = {
  // ---- reads (poll them: dashboard every 2 s) ----
  /** Everything the console shows in one call. 404 = no data for that astronaut yet. */
  dashboard: (id) => get(`/api/crew/${id}/dashboard`, `station/dashboard-${id}.json`),
  /** Link with Earth: link_up, link_delay_seconds, mission_day, what is waiting to be uploaded. */
  status: () => get("/api/status", "station/status.json"),
  /** Guidance, notes and prescriptions from Earth. */
  messages: (id, { unreadOnly = false } = {}) =>
    get(`/api/messages${qs({ astronaut_id: id, unread_only: unreadOnly ? "true" : "" })}`, `station/messages-${id}.json`),
  ackMessage: (messageId) => send("POST", `/api/messages/${messageId}/ack`),
  /** The saved questionnaires (PHQ-9, GAD-7), newest first. Each has `response`: the JSON the front sent. */
  questionnaires: (id, { questionnaire, answeredBy, since, until, limit = 50 } = {}) =>
    get(`/api/crew/${id}/questionnaires${qs({ questionnaire, answered_by: answeredBy, since, until, limit })}`, `station/questionnaires-${id}.json`),
  questionnaire: (id, questionnaireId) => get(`/api/crew/${id}/questionnaires/${questionnaireId}`, `station/questionnaire-${id}.json`),
  /** What the astronaut has typed (blood pressure, glucose, PHQ-9, GAD-7, log). kind is optional. */
  manual: (id, { kind, limit = 50 } = {}) => get(`/api/crew/${id}/manual${qs({ kind, limit })}`, `station/manual-${id}.json`),
  /** Profile, baseline, personal thresholds and goals that Earth has sent. */
  config: (id) => get(`/api/crew/${id}/config`, `station/config-${id}.json`),
  mission: () => get("/api/sim/mission", "station/mission.json"),
  changes: (params = {}) => get(`/api/changes${qs({ limit: 100, ...params })}`, "station/changes.json"),
  variables: () => get("/api/variables", "variables.json"),

  // ---- what the astronaut types (App 2). `actor` = who is typing ----
  bloodPressure: (id, { systolic, diastolic }, actor) => send("POST", `/api/crew/${id}/blood-pressure`, { systolic, diastolic }, actor),
  /** "Something hurts / I feel unwell". { symptom, severity, bodyArea?, description?, reportedBy? }.
   *  symptom: pain | headache | nausea | dizziness | fatigue | fever | breathing_difficulty | chest_pain | vision | mood | injury | other
   *  severity: mild | moderate | severe (severe = critical alert on Earth). Earth raises an alert and keeps the record. */
  reportSymptom: (id, { symptom, severity, bodyArea, description, reportedBy }, actor) =>
    send("POST", `/api/crew/${id}/symptom-report`, { symptom, severity, body_area: bodyArea, description, reported_by: reportedBy }, actor),
  /** The reports of this astronaut, newest first. `uplinked_at` says whether Earth already has it. */
  symptomReports: (id, { severity, limit = 50 } = {}) => get(`/api/crew/${id}/symptom-reports${qs({ severity, limit })}`, `station/symptom-reports-${id}.json`),
  glucose: (id, { value, context }, actor) => send("POST", `/api/crew/${id}/glucose`, { value, context }, actor), // context: fasting | postprandial
  /**
   * Save a PHQ-9 or GAD-7 that the front has already worked out: `json` is built with buildQuestionnaire() of
   * shared/questionnaires.js. It is kept whole as long text and also feeds the colours and the item 9 alert.
   * The answer has `level`, `item9_alert` and `response` (the JSON that was kept).
   */
  saveQuestionnaire: (id, json, actor) => send("POST", `/api/crew/${id}/questionnaires`, json, actor),
  // The older way, answers only (the backend works out the score). Prefer saveQuestionnaire.
  phq9: (id, answers, actor) => send("POST", `/api/crew/${id}/phq9`, { answers }, actor), // 9 answers, 0 to 3
  gad7: (id, answers, actor) => send("POST", `/api/crew/${id}/gad7`, { answers }, actor), // 7 answers, 0 to 3
  /** type: carbs_15g | ared_session | radiation_shelter | headache | blurred_vision | other */
  log: (id, { type, note }, actor) => send("POST", `/api/crew/${id}/log`, { type, note }, actor),

  // ---- the simulator (App 3) ----
  sendPacket: (packet, actor) => send("POST", "/api/sim/packet", packet, actor),
  solarEvent: ({ astronautId, doseMsv = 250 }, actor) => send("POST", "/api/sim/events/solar", { astronaut_id: astronautId, dose_msv: doseMsv }, actor),
  endSolarEvent: (astronautId, actor) => send("DELETE", `/api/sim/events/solar${qs({ astronaut_id: astronautId })}`, undefined, actor),
  /** Dose accumulated on the mission so far (mSv). The station keeps adding from there. */
  setDose: (id, missionDoseMsv, actor) => send("PUT", `/api/sim/astronauts/${id}/radiation`, { mission_dose_msv: missionDoseMsv }, actor),
  /** Any of: mission_day, link_latency_seconds, time_scale, link_up, builtin_simulator. */
  putMission: (patch, actor) => send("PUT", "/api/sim/mission", patch, actor),
};
