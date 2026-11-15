/**
 * Scenario presets strictly aligned with telemetry-v1.1.json test fixtures.
 */
const SIMULATOR_PRESETS = {
  normal: {
    activity_state: "resting",
    comm_latency_sec: 2.6,
    cabin_co2_mmhg: 1.9,
    cardiovascular: {
      heart_rate_bpm: 66,
      include_bp: false,
      blood_pressure_systolic_mmhg: 116,
      blood_pressure_diastolic_mmhg: 74,
      signal_quality: "good",
    },
    respiratory: {
      spo2_percent: 99,
      respiratory_rate_rpm: 13,
      signal_quality: "good",
    },
    thermoregulation: {
      core_temp_c: 36.9,
      signal_quality: "good",
    },
    radiation: {
      daily_rate_msv: 0.34,
      spe_active: false,
      event_dose_msv: 0.0,
      signal_quality: "good",
    },
    daily_assessment: {
      include: false,
      sleep_hours_last_night: 7.4,
      pvt_reaction_time_ms: 235,
      signal_quality: "good",
    },
  },

  attention: {
    activity_state: "working",
    comm_latency_sec: 2.6,
    cabin_co2_mmhg: 2.7,
    cardiovascular: {
      heart_rate_bpm: 104,
      include_bp: false,
      blood_pressure_systolic_mmhg: 132,
      blood_pressure_diastolic_mmhg: 84,
      signal_quality: "degraded",
    },
    respiratory: {
      spo2_percent: 95,
      respiratory_rate_rpm: 19,
      signal_quality: "good",
    },
    thermoregulation: {
      core_temp_c: 37.6,
      signal_quality: "good",
    },
    radiation: {
      daily_rate_msv: 0.48,
      spe_active: false,
      event_dose_msv: 0.0,
      signal_quality: "good",
    },
    daily_assessment: {
      include: true,
      sleep_hours_last_night: 5.8,
      pvt_reaction_time_ms: 310,
      signal_quality: "good",
    },
  },

  critical_eva: {
    activity_state: "eva",
    comm_latency_sec: 2.6,
    cabin_co2_mmhg: 3.4,
    cardiovascular: {
      heart_rate_bpm: 168,
      include_bp: false,
      blood_pressure_systolic_mmhg: 155,
      blood_pressure_diastolic_mmhg: 95,
      signal_quality: "good",
    },
    respiratory: {
      spo2_percent: 91,
      respiratory_rate_rpm: 28,
      signal_quality: "good",
    },
    thermoregulation: {
      core_temp_c: 40.1,
      signal_quality: "good",
    },
    radiation: {
      daily_rate_msv: 18.5,
      spe_active: true,
      event_dose_msv: 265.0,
      signal_quality: "good",
    },
    daily_assessment: {
      include: false,
      sleep_hours_last_night: 5.2,
      pvt_reaction_time_ms: 340,
      signal_quality: "good",
    },
  },

  sensor_lost: {
    activity_state: "eva",
    comm_latency_sec: 2.6,
    cabin_co2_mmhg: 2.2,
    cardiovascular: {
      heart_rate_bpm: 122,
      include_bp: false,
      blood_pressure_systolic_mmhg: 128,
      blood_pressure_diastolic_mmhg: 82,
      signal_quality: "good",
    },
    respiratory: {
      spo2_percent: 97,
      respiratory_rate_rpm: 16,
      signal_quality: "lost", // Will serialize spo2_percent & respiratory_rate_rpm as null
    },
    thermoregulation: {
      core_temp_c: 37.8,
      signal_quality: "good",
    },
    radiation: {
      daily_rate_msv: 0.45,
      spe_active: false,
      event_dose_msv: 0.0,
      signal_quality: "good",
    },
    daily_assessment: {
      include: false,
      sleep_hours_last_night: 6.8,
      pvt_reaction_time_ms: 250,
      signal_quality: "good",
    },
  },
};