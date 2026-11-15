// Base URL of the backend. Change it with VITE_API_URL (see .env.example).
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function getJSON(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return response.json();
}
