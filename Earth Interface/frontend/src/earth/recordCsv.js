// The record form and the CSV record share one definition. CSV layout: section,field,value,unit (one row per data point).
// `profile` = the key sent to PUT /api/astronauts/{id}; `goal` = key sent to PUT .../exercise-goals.
// Fields without either exist only in the CSV (the backend profile has no place for them yet).
const AGENCIES = ["NASA", "CSA", "ESA", "Roscosmos", "other"].map((v) => ({ value: v, label: v === "other" ? "Other" : v }));
const SEXES = [{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "other", label: "Other" }];

export const SECTIONS = [
  { title: "Identification", fields: [
    { key: "astronaut_id", label: "Astronaut ID", type: "text", required: true },
    { key: "name", label: "Full name", type: "text", required: true, profile: "name" },
    { key: "birth_date", label: "Birth date", type: "date", profile: "birth_date" },
    { key: "gender", label: "Biological sex", type: "select", options: SEXES, profile: "gender" },
    { key: "agency", label: "Space agency", type: "select", options: AGENCIES, required: true, profile: "agency" },
  ] },
  { title: "Anthropometry and countermeasures", fields: [
    { key: "weight_kg", label: "Weight", unit: "kg", type: "number", profile: "weight_kg" },
    { key: "height_m", label: "Height", unit: "m", type: "number" },
    { key: "ared_sessions_per_week", label: "ARED sessions per week", unit: "sessions", type: "number", goal: "ared_sessions_per_week" },
    { key: "ared_minutes_per_session", label: "Minutes per ARED session", unit: "min", type: "number", goal: "ared_minutes_per_session" },
  ] },
  { title: "Pre-flight baseline (on Earth)", fields: [
    { key: "baseline_hr", label: "Resting heart rate", unit: "bpm", type: "number", profile: "baseline_hr" },
    { key: "baseline_bp_systolic", label: "Systolic pressure", unit: "mmHg", type: "number", profile: "baseline_bp_systolic" },
    { key: "baseline_bp_diastolic", label: "Diastolic pressure", unit: "mmHg", type: "number", profile: "baseline_bp_diastolic" },
    { key: "baseline_core_temp_c", label: "Core temperature", unit: "°C", csvUnit: "degC", type: "number" },
    { key: "dxa_t_score", label: "Bone density, overall (DXA)", unit: "T-score", type: "number", profile: "dxa_t_score" },
    { key: "dxa_hip", label: "DXA hip", unit: "T-score", type: "number" },
    { key: "dxa_spine", label: "DXA spine", unit: "T-score", type: "number" },
    { key: "dxa_legs", label: "DXA legs", unit: "T-score", type: "number" },
    { key: "oct_notes", label: "Eye exam notes (OCT / ocular ultrasound)", type: "textarea", profile: "oct_notes", wide: true },
  ] },
  { title: "Previous radiation", fields: [
    { key: "prior_radiation_msv", label: "Dose from earlier missions", unit: "mSv", type: "number", profile: "prior_radiation_msv" },
  ] },
];

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.title })));
export const KCAL_PER_KG = 29; // daily energy requirement, as in the team document

export const dailyEnergy = (values) => {
  const w = Number(values.weight_kg);
  return w > 0 ? Math.round(w * KCAL_PER_KG) : "";
};

const quote = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
const toCsv = (rows) => ["section,field,value,unit", ...rows.map((r) => r.map(quote).join(","))].join("\n") + "\n";

/** The record CSV of one astronaut: only the data that was filled in, plus the computed energy need. */
export function buildRecordCsv(values) {
  const rows = [];
  ALL_FIELDS.forEach((f) => {
    const v = String(values[f.key] ?? "").trim();
    if (v) rows.push([f.section, f.key, v, f.csvUnit ?? f.unit ?? ""]);
    if (f.key === "height_m" && dailyEnergy(values) !== "") {
      rows.push([f.section, "daily_energy_requirement", dailyEnergy(values), "kcal/day"]);
    }
  });
  return toCsv(rows);
}

/** An empty file with every field, to fill in outside the app and upload later. */
export const recordTemplateCsv = () => toCsv(ALL_FIELDS.map((f) => [f.section, f.key, "", f.csvUnit ?? f.unit ?? ""]));

const clean = (v, type) => (type === "number" ? Number(v) : String(v).trim());
const pick = (values, prop) => Object.fromEntries(
  ALL_FIELDS.filter((f) => f[prop] && String(values[f.key] ?? "").trim() !== "")
    .map((f) => [f[prop], clean(values[f.key], f.type)]));
export const profilePatch = (values) => pick(values, "profile");
export const goalsPatch = (values) => pick(values, "goal");

/** Next free "AST-NN" for a new astronaut. */
export function nextAstronautId(ids) {
  const nums = ids.map((id) => /^AST-(\d+)$/.exec(id)?.[1]).filter(Boolean).map(Number);
  return `AST-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
}

/** Makes the browser download `text` as a CSV file. */
export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}