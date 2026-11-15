import { worst } from "./levels.js";

// The seven cards of the console, built only from the dashboard's data.
// Each card keeps the level the backend gave; nothing is compared to a limit.
const number = (value, digits = 1) =>
  value == null ? null : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });

export function buildCards(dashboard) {
  const vitals = Object.fromEntries((dashboard.vitals ?? []).map((v) => [v.key, v]));
  const manual = dashboard.manual_latest ?? {};
  const radiation = dashboard.radiation ?? {};
  const radiationSystem = (dashboard.systems ?? []).find((s) => s.system === "radiation");

  // A sensor without a reading says so; it never shows an old number or 0.
  const reading = (vital, unit, digits) => {
    if (!vital || vital.no_signal) return { text: "NO SIGNAL" };
    if (vital.value == null) return { text: "No data" };
    return { value: number(vital.value, digits), unit: unit ?? vital.unit };
  };
  const delta = (vital) =>
    vital && vital.baseline != null && vital.vs_baseline != null && !vital.no_signal
      ? [
          ["Your baseline", `${number(vital.baseline)} ${vital.unit}`],
          ["Difference", `${vital.vs_baseline > 0 ? "+" : ""}${number(vital.vs_baseline)} ${vital.unit}`],
        ]
      : [];

  const hr = vitals.heart_rate;
  const sys = vitals.blood_pressure_systolic;
  const dia = vitals.blood_pressure_diastolic;
  const temp = vitals.body_temperature;
  const sleep = vitals.sleep_hours;
  const nights = vitals.consecutive_nights_under_6h;
  const bp = manual.blood_pressure;
  const phq9 = manual.phq9;
  const gad7 = manual.gad7;
  const glucose = manual.glucose;

  const pressure =
    !sys || !dia || sys.no_signal || dia.no_signal || sys.value == null || dia.value == null
      ? { text: "NO SIGNAL" }
      : { value: `${number(sys.value, 0)}/${number(dia.value, 0)}`, unit: "mmHg" };

  return [
    {
      id: "sleep",
      title: "Sleep",
      level: worst(sleep?.level, nights?.level),
      main: reading(sleep, "h"),
      rows: nights && nights.value != null ? [["Nights under 6 h in a row", number(nights.value, 0)]] : [],
    },
    {
      id: "mood",
      title: "Mood and stress",
      level: worst(phq9?.level, gad7?.level),
      main: phq9 ? { value: String(phq9.score), unit: "PHQ-9" } : { text: "No data" },
      rows: [
        ...(phq9 ? [["PHQ-9", phq9.severity]] : []),
        ...(gad7 ? [["GAD-7", `${gad7.score} · ${gad7.severity}`]] : []),
        ...(phq9?.item9_alert ? [["Item 9", "ALERT: answered above zero"]] : []),
      ],
      alert: Boolean(phq9?.item9_alert),
    },
    {
      id: "heart_rate",
      title: "Heart rate",
      level: hr?.level ?? null,
      main: reading(hr, "bpm", 0),
      rows: delta(hr),
    },
    {
      id: "pressure",
      title: "Blood pressure",
      level: worst(sys?.level, dia?.level),
      main: pressure,
      rows: bp ? [["Last typed by the astronaut", `${number(bp.systolic, 0)}/${number(bp.diastolic, 0)}`]] : [],
    },
    {
      id: "temperature",
      title: "Temperature",
      level: temp?.level ?? null,
      main: reading(temp, "°C"),
      rows: [],
    },
    {
      id: "radiation",
      title: "Radiation",
      level: worst(radiationSystem?.level, vitals.radiation_rate_msv_day?.level),
      main:
        radiation.percent_of_limit == null
          ? { text: "No data" }
          : { value: number(radiation.percent_of_limit, 1), unit: "% of career limit" },
      bar: radiation.percent_of_limit ?? null,
      rows: [
        ...(radiation.total_msv == null ? [] : [["Total", `${number(radiation.total_msv, 1)} of ${radiation.career_limit_msv} mSv`]]),
        ...(radiation.rate_msv_day == null ? [] : [["Rate now", `${number(radiation.rate_msv_day, 3)} mSv/day`]]),
        ...(radiation.solar_event_alert ? [["Solar event", "ACTIVE"]] : []),
      ],
      alert: Boolean(radiation.solar_event_alert),
    },
    {
      id: "glucose",
      title: "Glucose",
      level: glucose?.level ?? null,
      main: glucose ? { value: number(glucose.value, 0), unit: "mg/dL" } : { text: "No data" },
      rows: glucose?.context ? [["Taken", glucose.context]] : [],
    },
  ];
}
