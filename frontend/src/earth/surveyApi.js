// Wellbeing questionnaires (PHQ-9 and GAD-7). They live on the STATION server (port 8001), like in the astronaut console:
//   GET  /api/crew/{id}/questionnaires?limit=50   newest first
//   POST /api/crew/{id}/questionnaires            the JSON built by lib/questionnaires.js (buildPayload)
import { request, STATION_URL } from "../shared/request.js";

export const surveys = {
  list: (id, { limit = 50 } = {}) => request(STATION_URL, "GET", `/api/crew/${id}/questionnaires?limit=${limit}`),
  save: (id, body) => request(STATION_URL, "POST", `/api/crew/${id}/questionnaires`, { body }),
};

// Symptom report: an astronaut sends an alert to the ground.
//   POST /api/crew/{id}/symptom-report   { symptom, severity, body_area, description, reported_by }
export const symptoms = {
  send: (id, body) => request(STATION_URL, "POST", `/api/crew/${id}/symptom-report`, { body }),
};
