import { request, EARTH_URL, qs } from "../shared/request.js";

const get = (path, mock) => request(EARTH_URL, "GET", path, { mock });
const send = (method, path, body, actor) => request(EARTH_URL, method, path, { body, actor });

export const earth = {
  astronauts: () => get("/api/astronauts", "earth/astronauts.json"),

  astronaut: (id) => get(`/api/astronauts/${id}`, `earth/astronaut-${id}.json`),

  dashboard: (id) => get(`/api/astronauts/${id}/dashboard`, `earth/dashboard-${id}.json`),

  readings: (id, { since, until, bucketSeconds, limit = 100 } = {}) =>
    get(`/api/astronauts/${id}/readings${qs({ since, until, bucket_seconds: bucketSeconds, limit })}`, `earth/readings-chart-${id}.json`),

  alerts: ({ astronautId, limit = 50 } = {}) => get(`/api/alerts${qs({ astronaut_id: astronautId, limit })}`, astronautId ? `earth/alerts-${astronautId}.json` : "earth/alerts.json"),

  manual: (id, { kind, limit = 50 } = {}) => get(`/api/astronauts/${id}/manual${qs({ kind, limit })}`, `earth/manual-${id}.json`),

  context: (id, { series = 100 } = {}) => get(`/api/astronauts/${id}/context${qs({ series })}`, `earth/context-${id}.json`),
  levelHistory: (id, { limit = 100 } = {}) => get(`/api/astronauts/${id}/level-history${qs({ limit })}`, `earth/level-history-${id}.json`),
  radiation: (id) => get(`/api/astronauts/${id}/radiation`, `earth/radiation-${id}.json`),

  thresholds: (id) => get(`/api/astronauts/${id}/thresholds`, `earth/thresholds-${id}.json`),
  exerciseGoals: (id) => get(`/api/astronauts/${id}/exercise-goals`, `earth/exercise-goals-${id}.json`),

  changes: (params = {}) => get(`/api/changes${qs({ limit: 100, ...params })}`, "earth/changes.json"),

  outbox: ({ pendingOnly = false, astronautId, limit = 50 } = {}) =>
    get(`/api/outbox${qs({ pending_only: pendingOnly ? "true" : "", astronaut_id: astronautId, limit })}`, "earth/outbox.json"),

  link: () => get("/api/station", "earth/station-link.json"),
  variables: () => get("/api/variables", "variables.json"),

  putProfile: (id, patch, actor) => send("PUT", `/api/astronauts/${id}`, patch, actor),

  putThresholds: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/thresholds`, patch, actor),
  putExerciseGoals: (id, patch, actor) => send("PUT", `/api/astronauts/${id}/exercise-goals`, patch, actor),

  addNote: (id, { body, kind = "note", severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/notes`, { body, kind, severity }, actor),
  sendMessage: (id, { body, severity = "info" }, actor) => send("POST", `/api/astronauts/${id}/messages`, { body, severity }, actor),
};
