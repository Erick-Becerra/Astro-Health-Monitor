// Core of the API clients (Station and Earth). Copy the whole `shared/` folder into your project.
//
// Environment (Vite): put these in a `.env` file of the frontend, never in the code.
//   VITE_STATION_URL=http://172.20.10.2:8001     server of the space station
//   VITE_EARTH_URL=http://172.20.10.2:8000       server of the Earth base
//   VITE_USE_MOCKS=true                          read docs/mocks instead of the servers (copy them to public/mocks)
//   VITE_ACTOR=Dr. Rivera                        who is using the screen: it goes to the change log
const env = import.meta.env ?? {};

export const USE_MOCKS = env.VITE_USE_MOCKS === "true";
export const STATION_URL = env.VITE_STATION_URL ?? "http://localhost:8001";
export const EARTH_URL = env.VITE_EARTH_URL ?? "http://localhost:8000";
export const ACTOR = env.VITE_ACTOR ?? "frontend";

export class ApiError extends Error {
  constructor(status, detail, url) {
    super(typeof detail === "string" ? detail : describeDetail(detail));
    this.status = status; // 0 = no answer (network, firewall, wrong address), 404 = no data yet, 422 = invalid value
    this.detail = detail;
    this.url = url;
  }
}

// The 422 answers carry a list of {loc, msg}. This turns them into one readable sentence.
function describeDetail(detail) {
  if (!Array.isArray(detail)) return JSON.stringify(detail);
  return detail.map((d) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ");
}

export const describeError = (error) =>
  error instanceof ApiError ? error.message : "No se pudo contactar con el servidor";

/**
 * One call to the API. `mock` is the file of docs/mocks used when VITE_USE_MOCKS is on.
 * Writes (POST, PUT, DELETE) do nothing with mocks and answer {mocked: true}.
 */
export async function request(base, method, path, { body, mock, actor } = {}) {
  if (USE_MOCKS) {
    if (method !== "GET") return { mocked: true };
    if (!mock) throw new ApiError(0, `There is no mock for ${path}`, path);
    const response = await fetch(`/mocks/${mock}`);
    if (!response.ok) throw new ApiError(response.status, `Mock not found: ${mock}`, mock);
    return response.json();
  }
  const url = base + path;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "X-Actor": actor ?? ACTOR },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "No answer from the server", url);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.detail ?? response.statusText, url);
  return data;
}

export const qs = (params) => {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return clean.length ? "?" + new URLSearchParams(clean).toString() : "";
};
