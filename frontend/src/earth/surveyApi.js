import { request, STATION_URL } from "../shared/request.js";

export const surveys = {
  list: (id, { limit = 50 } = {}) => request(STATION_URL, "GET", `/api/crew/${id}/questionnaires?limit=${limit}`),
  save: (id, body) => request(STATION_URL, "POST", `/api/crew/${id}/questionnaires`, { body }),
};

export const symptoms = {
  send: (id, body) => request(STATION_URL, "POST", `/api/crew/${id}/symptom-report`, { body }),
};
