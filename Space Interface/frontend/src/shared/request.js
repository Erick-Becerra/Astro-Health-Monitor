import { connection } from "../connection.js";

const env = import.meta.env ?? {};

export const USE_MOCKS = env.VITE_USE_MOCKS === "true";
export const STATION_URL = env.VITE_STATION_URL ?? "http://localhost:8001";
export const EARTH_URL = env.VITE_EARTH_URL ?? "http://localhost:8000";
export const ACTOR = env.VITE_ACTOR ?? "frontend";

export class ApiError extends Error {
  constructor(status, detail, url) {
    super(typeof detail === "string" ? detail : describeDetail(detail));
    this.status = status;
    this.detail = detail;
    this.url = url;
  }
}

function describeDetail(detail) {
  if (!Array.isArray(detail)) return JSON.stringify(detail);
  return detail.map((d) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ");
}

export const describeError = (error) =>
  error instanceof ApiError ? error.message : "No se pudo contactar con el servidor";

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
    connection.failed();
    throw new ApiError(0, "No answer from the server", url);
  }
  connection.ok();
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.detail ?? response.statusText, url);
  return data;
}

export const qs = (params) => {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return clean.length ? "?" + new URLSearchParams(clean).toString() : "";
};
