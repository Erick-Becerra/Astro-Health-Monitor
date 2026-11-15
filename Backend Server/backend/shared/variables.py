"""Catalog of every variable the three apps read or write.

One place says what each variable is, its unit, its allowed range, who may
write it and in which app it is edited. Both services serve it at
GET /api/variables so the interfaces can build their editable controls from it,
and the validation ranges of the API come from here too.

writer:  simulator (App 3) | crew (App 2) | earth (App 1) | station (computed)
app:     the interface where a person edits it
log_delta: for continuous telemetry only. A change is written to the change
           log when it moves at least this much (so sensor noise does not
           flood the log). Variables without it log every change.
"""

AGENCY_DOSE_LIMIT_MSV = {"NASA": 600, "CSA": 1000, "ESA": 1000, "Roscosmos": 1000}
DEFAULT_DOSE_LIMIT_MSV = 600
SPE_DOSE_MSV = 250  # one solar particle event of this size raises the solar-event alert

CREW_STATES = ["resting", "sleeping", "working", "exercising", "post_exercise_recovery", "eva"]
# Other words for the same states (the old names of the first packet format and a few synonyms).
CREW_STATE_ALIASES = {
    **{s: s for s in CREW_STATES},
    "rest": "resting", "reposo": "resting",
    "sleep": "sleeping", "asleep": "sleeping", "sueno": "sleeping", "sueño": "sleeping",
    "work": "working", "trabajo": "working",
    "exercise": "exercising", "ared": "exercising", "resistive_exercise": "exercising", "ejercicio": "exercising",
    "recovery": "post_exercise_recovery",
    "spacewalk": "eva", "caminata_espacial": "eva",
}
GLUCOSE_CONTEXTS = ["fasting", "postprandial"]
COUNTERMEASURES = ["carbs_15g", "ared_session", "radiation_shelter", "headache", "blurred_vision", "other"]
AGENCIES = list(AGENCY_DOSE_LIMIT_MSV) + ["other"]


def _v(key, label, unit, group, writer, app, kind="number", lo=None, hi=None, options=None,
       log_delta=None, description=""):
    return {"key": key, "label": label, "unit": unit, "group": group, "type": kind, "min": lo, "max": hi,
            "options": options, "writer": writer, "editable_in": app, "log_delta": log_delta,
            "description": description}


SIM, CREW, EARTH, STATION = "simulator-app", "space-app", "earth-app", "computed"

CATALOG = [
    # ---- continuous telemetry, emitted by the simulator app -----------------
    _v("heart_rate", "Heart rate", "bpm", "telemetry", "simulator", SIM, lo=20, hi=250, log_delta=5),
    _v("hrv_ms", "Heart rate variability", "ms", "telemetry", "simulator", SIM, lo=5, hi=250, log_delta=8),
    _v("body_temperature", "Core body temperature", "°C", "telemetry", "simulator", SIM, lo=30, hi=44,
       log_delta=0.3),
    _v("sleep_hours", "Sleep last night", "h", "telemetry", "simulator", SIM, lo=0, hi=24, log_delta=0.5,
       description="From the daily assessment of the simulator"),
    _v("consecutive_nights_under_6h", "Consecutive nights under 6 h", "nights", "telemetry", "station",
       STATION, "integer", lo=0, hi=60,
       description="Computed by the station from the daily assessments (nights in a row under 6 hours)"),
    _v("consecutive_nights_under_4h", "Consecutive nights under 4 h", "nights", "telemetry", "station",
       STATION, "integer", lo=0, hi=60,
       description="Computed by the station from the daily assessments (nights in a row under 4 hours)"),
    _v("pvt_b_ms", "Reaction time (PVT-B)", "ms", "telemetry", "simulator", SIM, lo=100, hi=5000,
       log_delta=40, description="From the daily assessment of the simulator"),
    _v("spo2", "Oxygen saturation", "%", "telemetry", "simulator", SIM, lo=50, hi=100, log_delta=2),
    _v("respiratory_rate", "Respiratory rate", "rpm", "telemetry", "simulator", SIM, lo=4, hi=60,
       log_delta=3),
    _v("radiation_rate_msv_day", "Radiation rate", "mSv/day", "telemetry", "simulator", SIM, lo=0, hi=1000,
       log_delta=0.1, description="Nominal in orbit: 0.2 to 0.5"),
    _v("radiation_dose_msv", "Mission accumulated dose", "mSv", "telemetry", "station", STATION, lo=0,
       hi=5000, log_delta=1,
       description="Computed by the station: it adds up the radiation rate over time (see time_scale) and "
                   "the solar event doses. It can be set with PUT /api/sim/astronauts/{id}/radiation"),
    _v("spe_active", "Solar particle event in progress", "", "telemetry", "simulator", SIM, "boolean"),
    _v("spe_event_dose_msv", "Solar particle event dose", "mSv", "telemetry", "simulator", SIM, lo=0,
       hi=5000, log_delta=50, description="An event of 250 mSv or more raises the solar-event alert"),
    # ---- environment and crew state, from the simulator app -----------------
    _v("cabin_co2_mmhg", "Cabin CO2", "mmHg", "environment", "simulator", SIM, lo=0, hi=50, log_delta=0.1,
       description="Alerts from 2.3, limit 3.0"),
    _v("crew_state", "Crew state", "", "environment", "simulator", SIM, "enum", options=CREW_STATES),
    # ---- mission clock and link, from the simulator app ---------------------
    _v("mission_day", "Mission day", "day", "mission", "simulator", SIM, "integer", lo=0, hi=1500),
    _v("link_latency_seconds", "Link latency, one way", "s", "mission", "simulator", SIM, lo=0, hi=2640,
       description="Moon 2.6 s, Mars up to 2640 s (44 min)"),
    _v("time_scale", "Radiation time scale", "x", "mission", "simulator", SIM, lo=1, hi=100000),
    _v("link_up", "Link with Earth up", "", "mission", "simulator", SIM, "boolean"),
    _v("builtin_simulator", "Built-in demo simulator on", "", "mission", "simulator", SIM, "boolean"),
    # ---- manual captures, typed by the crew in the space app ----------------
    _v("blood_pressure_systolic", "Systolic pressure", "mmHg", "manual", "crew", CREW, lo=40, hi=260,
       log_delta=10, description="Sent by the simulator in the cardiovascular group and also typed by the crew"),
    _v("blood_pressure_diastolic", "Diastolic pressure", "mmHg", "manual", "crew", CREW, lo=20, hi=160,
       log_delta=8, description="Sent by the simulator in the cardiovascular group and also typed by the crew"),
    _v("glucose_mg_dl", "Blood glucose", "mg/dL", "manual", "crew", CREW, lo=20, hi=600),
    _v("glucose_context", "Glucose context", "", "manual", "crew", CREW, "enum", options=GLUCOSE_CONTEXTS),
    _v("phq9_answers", "PHQ-9 answers (9 items, 0 to 3)", "", "manual", "crew", CREW, "list"),
    _v("gad7_answers", "GAD-7 answers (7 items, 0 to 3)", "", "manual", "crew", CREW, "list"),
    _v("countermeasure", "Countermeasure or symptom log", "", "manual", "crew", CREW, "enum",
       options=COUNTERMEASURES),
    # ---- profile and baseline, written from Earth ---------------------------
    _v("name", "Name", "", "profile", "earth", EARTH, "text"),
    _v("gender", "Gender", "", "profile", "earth", EARTH, "enum", options=["female", "male", "other"]),
    _v("birth_date", "Date of birth", "", "profile", "earth", EARTH, "text"),
    _v("weight_kg", "Weight", "kg", "profile", "earth", EARTH, lo=30, hi=200),
    _v("agency", "Assigned agency", "", "profile", "earth", EARTH, "enum", options=AGENCIES,
       description="Sets the career dose limit: NASA 600 mSv, CSA/ESA/Roscosmos 1000 mSv"),
    _v("baseline_hr", "Baseline heart rate (pre-flight)", "bpm", "profile", "earth", EARTH, lo=30, hi=120),
    _v("baseline_bp_systolic", "Baseline systolic pressure", "mmHg", "profile", "earth", EARTH, lo=70,
       hi=200),
    _v("baseline_bp_diastolic", "Baseline diastolic pressure", "mmHg", "profile", "earth", EARTH, lo=40,
       hi=130),
    _v("baseline_pvt_ms", "Baseline reaction time (PVT-B, pre-flight)", "ms", "profile", "earth", EARTH, lo=100,
       hi=1500, description="The reaction-time rules are relative to this value (default 300 ms)"),
    _v("dxa_t_score", "Bone density (DXA T-score)", "", "profile", "earth", EARTH, lo=-6, hi=4),
    _v("oct_notes", "Eye exam (OCT) notes", "", "profile", "earth", EARTH, "text"),
    _v("prior_radiation_msv", "Radiation received before this mission", "mSv", "profile", "earth", EARTH,
       lo=0, hi=2000),
    # ---- clinical rules, written from Earth and sent to the station ---------
    _v("thresholds", "Personal thresholds per indicator", "", "rules", "earth", EARTH, "object",
       description='{"body_temperature": {"yellow": 37.3, "orange": 37.8, "red": 38.3}}'),
    _v("exercise_goals", "ARED exercise goals", "", "rules", "earth", EARTH, "object",
       description='{"ared_sessions_per_week": 5, "ared_minutes_per_session": 45}'),
    _v("note", "Medical note", "", "rules", "earth", EARTH, "text"),
]

BY_KEY = {v["key"]: v for v in CATALOG}


def rng(key: str) -> dict:
    """Pydantic Field arguments (ge, le) for a variable, taken from the catalog."""
    v = BY_KEY[key]
    out = {}
    if v["min"] is not None:
        out["ge"] = v["min"]
    if v["max"] is not None:
        out["le"] = v["max"]
    return out
