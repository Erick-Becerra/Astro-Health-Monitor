import { connection } from "./connection.js";

// Address of the space station server. It changes when the hotspot restarts,
// so it lives in .env (VITE_STATION_URL), never in the code.
export const STATION_URL = import.meta.env.VITE_STATION_URL ?? "http://localhost:8001";

// Name sent with every write (header X-Actor) so the station's change log shows who did it.
// Set it with VITE_ACTOR in .env.
export const ACTOR = import.meta.env.VITE_ACTOR ?? "Console operator";

// A server that does not answer in this time counts as unreachable.
const TIMEOUT_MS = 6000;

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${STATION_URL}${path}`, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (cause) {
    connection.failed();
    const error = new Error("Cannot reach the station.", { cause });
    error.unreachable = true;
    throw error;
  }
  connection.ok(); // it answered, even if the answer is an error

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).detail;
    } catch {
      /* the body was not JSON */
    }
    const error = new Error(`Request to ${path} failed with status ${response.status}`);
    error.status = response.status;
    error.detail = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
    throw error;
  }
  return response.json();
}

export const getJSON = (path) => request(path);

export const postJSON = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Actor": ACTOR },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// A sentence for the user. 404 means the astronaut has no data yet; 422 carries
// the reason (for example which value is out of range).
export function describeError(error) {
  if (!error) return "";
  if (error.status === 404) return "There is no data for this astronaut yet.";
  if (error.status === 422) return error.detail || "A value is out of range.";
  if (error.status) return `The station answered with an error (${error.status}).`;
  return "Cannot reach the station.";
}
