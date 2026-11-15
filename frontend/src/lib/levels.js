export const LEVELS = ["green", "yellow", "orange", "red"];

export const LEVEL_TEXT = {
  green: "Normal",
  yellow: "Attention",
  orange: "Warning",
  red: "Critical",
};

export const BANNER_TEXT = {
  green: "All crew systems are normal",
  yellow: "Some readings need attention",
  orange: "Warning: act on the guidance below",
  red: "Critical: contact the flight surgeon",
};

const rank = (level) => LEVELS.indexOf(level);

export const worst = (...levels) =>
  levels.filter((l) => rank(l) >= 0).reduce((a, b) => (rank(b) > rank(a) ? b : a), null);

export const STALE_MS = 15000;
export const isStale = (iso, now = Date.now()) => !iso || now - Date.parse(iso) > STALE_MS;

export function ago(iso, now = Date.now()) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}
