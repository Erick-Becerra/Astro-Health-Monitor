export const LEVEL_ORDER = ["green", "yellow", "orange", "red"];

export function worstLevel(levels) {
  let worst = null;
  for (const level of levels) {
    if (!level) continue;
    if (worst === null || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(worst)) worst = level;
  }
  return worst;
}

export function isStale(isoTime, maxSeconds = 15, now = Date.now()) {
  if (!isoTime) return true;
  return (now - new Date(isoTime).getTime()) / 1000 > maxSeconds;
}

export function show(value, decimals = 0) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(decimals);
}

export const vitalOf = (dashboard, key) => dashboard.vitals.find((v) => v.key === key) ?? null;
export const systemOf = (dashboard, key) => dashboard.systems.find((s) => s.system === key) ?? null;

export function buildCards(d) {
  const v = (key) => vitalOf(d, key);
  const manual = d.manual_latest ?? {};
  return [
    {
      id: "sleep", system: "brain", level: v("sleep_hours")?.level ?? null, noSignal: !!v("sleep_hours")?.no_signal,
      values: { hours: v("sleep_hours")?.value ?? null, nights: v("consecutive_nights_under_6h")?.value ?? null },
    },
    {
      id: "mood", system: "brain", level: worstLevel([manual.phq9?.level, manual.gad7?.level]),
      values: { phq9: manual.phq9?.score ?? null, gad7: manual.gad7?.score ?? null },
      item9: !!manual.phq9?.item9_alert,
    },
    {
      id: "heart_rate", system: "heart", level: v("heart_rate")?.level ?? null, noSignal: !!v("heart_rate")?.no_signal,
      values: { bpm: v("heart_rate")?.value ?? null, baseline: v("heart_rate")?.baseline ?? null },
    },
    {
      id: "blood_pressure", system: "heart",
      level: worstLevel([v("blood_pressure_systolic")?.level, v("blood_pressure_diastolic")?.level]),
      noSignal: !!v("blood_pressure_systolic")?.no_signal, source: v("blood_pressure_systolic")?.source ?? null,
      values: { systolic: v("blood_pressure_systolic")?.value ?? null, diastolic: v("blood_pressure_diastolic")?.value ?? null },
    },
    {
      id: "temperature", system: "thermal", level: v("body_temperature")?.level ?? null,
      noSignal: !!v("body_temperature")?.no_signal, values: { celsius: v("body_temperature")?.value ?? null },
    },
    {
      id: "radiation", system: "radiation", level: systemOf(d, "radiation")?.level ?? null,
      solarAlert: !!d.radiation?.solar_event_alert,
      values: { percent: d.radiation?.percent_of_limit ?? null, totalMsv: d.radiation?.total_msv ?? null,
                limitMsv: d.radiation?.career_limit_msv ?? null },
    },
    {
      id: "glucose", system: "metabolism", level: manual.glucose?.level ?? null,
      values: { mgdl: manual.glucose?.value ?? null, context: manual.glucose?.context ?? null },
    },
  ];
}
