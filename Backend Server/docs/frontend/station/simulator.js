// What the simulator panel (App 3) needs: build the packet of the schema v1.1 from the sliders, and the
// scenarios of the drop-down. Pure functions plus calls to the station client.
//
// Sliders to what the backend wants:
//   heart rate, blood pressure, temperature, SpO2, breathing, CO2, activity, radiation rate -> buildPacket()
//   hours of sleep + nights in a row         -> setSleep()   (the station counts the nights from daily assessments)
//   PHQ-9 / GAD-7 total score + item 9 box   -> setMood()    (the backend wants the answers: answersFromScore())
//   glucose                                  -> station.glucose()
//   accumulated radiation                    -> setRadiationTotal()
//   solar event                              -> buildPacket(..., { solar }) or station.solarEvent()
//   latency / link on-off / mission day      -> station.putMission()

export const NOMINAL = {
  activity: "resting", // resting | sleeping | working | exercising | post_exercise_recovery | eva
  hr: 62, sys: 116, dia: 74, spo2: 98, rr: 14, temp: 36.7, co2: 2.0, rate: 0.42, latency: 2.6,
};

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const dayIso = (daysAgo = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
let counter = 0;

/**
 * A full packet of the schema v1.1.
 *   values:  any of NOMINAL's fields (the rest are nominal)
 *   options: { signal: { cardiovascular: "lost" } }  signal quality per group (good | degraded | lost);
 *                                                     "lost" sends null in every value of the group
 *            { solar: { active: true, dose: 250 } }   solar particle event
 *            { daily: {...} }                         daily assessment, see dailyAssessment()
 *            { source, measuredAt, packetId }
 */
export function buildPacket(astronautId, values = {}, options = {}) {
  const v = { ...NOMINAL, ...values };
  const quality = { cardiovascular: "good", respiratory: "good", thermoregulation: "good", radiation_dosimetry: "good", ...(options.signal ?? {}) };
  const orNull = (group, x) => (quality[group] === "lost" ? null : x);
  return {
    schema_version: "1.1",
    header: {
      packet_id: options.packetId ?? `SIM-${astronautId}-${Date.now()}-${counter++}`,
      astronaut_id: astronautId,
      measured_at: options.measuredAt ?? nowIso(),
      source: options.source ?? "automated_sensor_stream", // automated_sensor_stream | periodic_device_trigger | manual_override
    },
    mission_context: { activity_state: v.activity, comm_latency_sec: v.latency, environment: { cabin_co2_mmhg: v.co2 } },
    biometrics: {
      cardiovascular: {
        heart_rate_bpm: orNull("cardiovascular", Math.round(v.hr)),
        blood_pressure_systolic_mmhg: orNull("cardiovascular", Math.round(v.sys)),
        blood_pressure_diastolic_mmhg: orNull("cardiovascular", Math.round(v.dia)),
        sensor_hardware: "Bio-Monitor ECG", signal_quality: quality.cardiovascular,
      },
      respiratory: {
        spo2_percent: orNull("respiratory", v.spo2), respiratory_rate_rpm: orNull("respiratory", Math.round(v.rr)),
        sensor_hardware: "Pulse Oximeter", signal_quality: quality.respiratory,
      },
      thermoregulation: {
        core_temp_c: orNull("thermoregulation", v.temp), sensor_hardware: "Double Sensor Forehead",
        signal_quality: quality.thermoregulation,
      },
    },
    daily_assessment: options.daily ?? null,
    ...(options.mood ? { mood_assessment: options.mood } : {}), // see moodAssessment()
    radiation_dosimetry: {
      daily_rate_msv: orNull("radiation_dosimetry", v.rate),
      solar_particle_event: {
        active: !!options.solar?.active,
        event_dose_msv: quality.radiation_dosimetry === "lost" ? null : (options.solar?.dose ?? 0),
      },
      sensor_hardware: "RAD / Liulin Active Dosimeter", signal_quality: quality.radiation_dosimetry,
    },
  };
}

/** A daily assessment (sleep of the last night and reaction time). */
export const dailyAssessment = (dateIso, hours, pvtMs = 300) => ({
  assessment_date: dateIso, sleep_hours_last_night: hours, pvt_reaction_time_ms: pvtMs,
  sensor_hardware: "Actiwatch / PVT-B", signal_quality: "good",
});

/**
 * Turns a total score into the answers the backend wants (9 for the PHQ-9, 7 for the GAD-7, each 0 to 3).
 * The answers are spread evenly. Item 9 of the PHQ-9 is never above 0 unless item9 is true (it raises a red
 * alert), so without it the PHQ-9 tops out at 24. The sum can be lower than `score` if it does not fit.
 */
export function answersFromScore(score, items, { item9 = false } = {}) {
  const slots = items === 9 ? 8 : items;
  const answers = new Array(items).fill(0);
  let rest = Math.max(0, Math.round(score));
  if (items === 9 && item9) {
    answers[8] = 1;
    rest = Math.max(0, rest - 1);
  }
  for (let round = 0; round < 3 && rest > 0; round++) {
    for (let i = 0; i < slots && rest > 0; i++) {
      answers[i] += 1;
      rest -= 1;
    }
  }
  if (items === 9 && item9) {
    while (rest > 0 && answers[8] < 3) {
      answers[8] += 1;
      rest -= 1;
    }
  }
  return answers;
}

/** Sleep and nights in a row: sends one assessment per night, today and the days before. */
export async function setSleep(station, id, hours, nights = 1, actor) {
  for (let back = nights - 1; back >= 0; back--) {
    const partial = {
      schema_version: "1.1",
      header: { packet_id: `SIM-${id}-sleep-${Date.now()}-${back}`, astronaut_id: id, measured_at: nowIso(), source: "periodic_device_trigger" },
      daily_assessment: dailyAssessment(dayIso(back), hours),
    };
    await station.sendPacket(partial, actor); // sections that are absent leave the other values as they were
  }
}

/** mood_assessment block of a packet from two total scores (PHQ-9 0-27, GAD-7 0-21). Pass it as options.mood of buildPacket(). */
export function moodAssessment({ phq9, gad7, item9 = false }) {
  const p = answersFromScore(phq9, 9, { item9 }), g = answersFromScore(gad7, 7);
  const sum = (a) => a.reduce((x, y) => x + y, 0); // the backend checks that total = sum of the items
  return {
    assessment_date: dayIso(0),
    phq9: { item_scores: p, total: sum(p), item9_positive: p[8] > 0 },
    gad7: { item_scores: g, total: sum(g) },
  };
}

/** PHQ-9 and GAD-7 from their total scores. item9 = the "Alert item 9" box. */
export async function setMood(station, id, { phq9, gad7, item9 = false }, actor) {
  if (phq9 !== undefined) await station.phq9(id, answersFromScore(phq9, 9, { item9 }), actor);
  if (gad7 !== undefined) await station.gad7(id, answersFromScore(gad7, 7), actor);
}

/** Accumulated radiation as a total including the dose before the mission (the "528" of 600). */
export const setRadiationTotal = (station, id, totalMsv, priorMsv = 0, actor) =>
  station.setDose(id, Math.max(0, totalMsv - priorMsv), actor);

/** "Restore nominal values": everything back to normal. Old captures stay in the history; new ones become the latest. */
export async function restoreNominal(station, id, actor) {
  await station.sendPacket(buildPacket(id, {}, { source: "manual_override" }), actor);
  await setSleep(station, id, 7.5, 1, actor);
  await setMood(station, id, { phq9: 0, gad7: 0 }, actor);
  await station.glucose(id, { value: 90, context: "fasting" }, actor);
}

/**
 * The drop-down of scenarios. The key is also the key of the display name (t.scenario(key)).
 * Each one is an async function (station, astronautId, actor).
 */
export const scenarios = {
  nominal: restoreNominal,
  solarStorm: (s, id, a) => s.sendPacket(buildPacket(id, { rate: 8 }, { solar: { active: true, dose: 250 } }), a),
  sleepDeficit: (s, id, a) => setSleep(s, id, 5.4, 3, a),
  co2Rise: (s, id, a) => s.sendPacket(buildPacket(id, { co2: 2.9 }), a),
  heartSensorLost: (s, id, a) => s.sendPacket(buildPacket(id, {}, { signal: { cardiovascular: "lost" } }), a),
  tachycardiaAtRest: (s, id, a) => s.sendPacket(buildPacket(id, { hr: 149 }), a),
  exercise: (s, id, a) => s.sendPacket(buildPacket(id, { activity: "exercising", hr: 150, sys: 150, dia: 80, rr: 26, temp: 37.5 }), a),
  hypertension: (s, id, a) => s.sendPacket(buildPacket(id, { sys: 150, dia: 95 }), a),
  fever: (s, id, a) => s.sendPacket(buildPacket(id, { temp: 38.6, hr: 92 }), a),
  lowGlucose: (s, id, a) => s.glucose(id, { value: 62, context: "fasting" }, a),
  itemNine: (s, id, a) => setMood(s, id, { phq9: 12, item9: true }, a),
};
