"""Clinical logic that is not a plain threshold: manual captures, questionnaires,
the radiation budget and the consolidated dashboard of one astronaut.

The rules of the telemetry, the PHQ-9 and the GAD-7 are in shared/indicators.py (the indicators document). The
rules for glucose, the symptoms (SANS), the exercise adherence and the bone density are not in that document:
they are placeholders to be reviewed with the clinical team.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import indicators
from .indicators import CONTENT, LEVEL_NAME, evaluate_dose, evaluate_link, gad7_band, phq9_band, phq9_total_band
from .variables import (AGENCY_DOSE_LIMIT_MSV, BY_KEY, DEFAULT_DOSE_LIMIT_MSV, SPE_DOSE_MSV)
from .vitals import LEVEL_TO_STATUS, classify, worst_level

# ----------------------------------------------------------------- manual captures


def _finding(indicator, label, value, unit, level, advice):
    """A finding for the rules that are not in the indicators document (it has a message and no procedure)."""
    return {"indicator": indicator, "label": label, "value": value, "unit": unit, "level": level,
            "status": LEVEL_TO_STATUS[level], "level_name": LEVEL_NAME[level], "criteria": "", "action": advice,
            "advice": advice, "message": advice, "procedure": [], "context": None}


def glucose_finding(value: float, context: str) -> Optional[dict]:
    """Level of a capillary glucose in mg/dL. None when it is in range."""
    if value < 70:
        level, advice = "red", ("Low glucose. Take 15 g of fast carbohydrates, wait 15 minutes and measure "
                                "again. Repeat if still below 70 and contact the flight surgeon.")
    elif context == "fasting":
        if value < 80:
            level, advice = "yellow", "Glucose is on the low side. Eat something and measure again in an hour."
        elif value < 100:
            return None
        elif value < 126:
            level, advice = "yellow", "Fasting glucose above normal. Review meals and repeat tomorrow morning."
        elif value < 200:
            level, advice = "orange", "High fasting glucose. Tell the flight surgeon and repeat the measurement."
        else:
            level, advice = "red", "Very high glucose. Contact the flight surgeon now."
    else:  # postprandial
        if value < 140:
            return None
        elif value < 180:
            level, advice = "yellow", "Glucose after eating is above normal. Review the meal and measure later."
        elif value < 250:
            level, advice = "orange", "High glucose after eating. Tell the flight surgeon."
        else:
            level, advice = "red", "Very high glucose. Contact the flight surgeon now."
    return _finding("glucose_mg_dl", f"Blood glucose ({context})", value, "mg/dL", level, advice)


def phq9_result(answers: list[int]) -> dict:
    """Score, severity name and level of a PHQ-9 (question 9 above zero is Critical whatever the total)."""
    score = sum(answers)
    item9 = answers[8] > 0
    for upto, label in ((4, "minimal"), (9, "mild"), (14, "moderate"), (19, "moderately severe"), (27, "severe")):
        if score <= upto:
            break
    return {"score": score, "severity": label, "item9_alert": item9, "level": phq9_band(score, answers[8])[0]}


def gad7_result(answers: list[int]) -> dict:
    score = sum(answers)
    for upto, label in ((4, "minimal"), (9, "mild"), (14, "moderate"), (21, "severe")):
        if score <= upto:
            break
    return {"score": score, "severity": label, "level": gad7_band(score)[0]}


# What the crew member sees when question 9 of the PHQ-9 is above zero (the message of the indicators document).
ITEM9_ADVICE = CONTENT["phq9"]["red_item9"]["message"]


def evaluate_manual(kind: str, payload: dict, overrides: Optional[dict] = None) -> dict:
    """Evaluate a manual capture.

    Returns {"payload": the payload plus computed fields, "level": green|yellow|orange|red or None,
    "findings": [...]}. `overrides` are the personal thresholds of the astronaut.
    """
    payload = dict(payload)
    findings: list = []
    level: Optional[str] = None
    if kind == "blood_pressure":
        result = classify({"blood_pressure_systolic": payload["systolic"],
                           "blood_pressure_diastolic": payload["diastolic"]}, overrides)
        findings, level = result["findings"], result["level"]
    elif kind == "glucose":
        f = glucose_finding(payload["value"], payload["context"])
        findings = [f] if f else []
        level = f["level"] if f else "green"
    elif kind in ("phq9", "gad7"):
        res = phq9_result(payload["answers"]) if kind == "phq9" else gad7_result(payload["answers"])
        payload.update({k: v for k, v in res.items() if k != "level"})
        level = res["level"]
        name = "PHQ-9 (depression)" if kind == "phq9" else "GAD-7 (anxiety)"
        total = res["score"]
        total_level, total_key = phq9_total_band(total) if kind == "phq9" else gad7_band(total)
        if kind == "phq9" and res["item9_alert"]:  # question 9 above zero comes first
            findings.append(indicators.finding("phq9_item9", "PHQ-9 item 9", payload["answers"][8], "", "red", "phq9",
                                               "red_item9"))
        if total_level != "green":
            findings.append(indicators.finding(kind, name, total, "points", total_level, kind, total_key))
    return {"payload": payload, "level": level, "findings": findings}


# ---------------------------------------------------------------------- dashboard

# system: (label, NASA Human Research Program hazard it is mostly linked to)
SYSTEMS = {
    "heart": ("Cardiovascular", "Altered gravity"),
    "lungs": ("Respiratory", "Hostile closed environment"),
    "brain": ("Brain and behavior", "Isolation and confinement"),
    "metabolism": ("Metabolism", "Hostile closed environment"),
    "thermal": ("Temperature and immunity", "Hostile closed environment"),
    "radiation": ("Radiation exposure", "Space radiation"),
    "bones": ("Bones and muscle", "Altered gravity"),
    "eyes": ("Eyes (SANS)", "Altered gravity"),
}
INDICATOR_SYSTEM = {
    "heart_rate": "heart", "hrv_ms": "heart", "blood_pressure_systolic": "heart",
    "blood_pressure_diastolic": "heart",
    "spo2": "lungs", "respiratory_rate": "lungs", "cabin_co2_mmhg": "lungs",
    "sleep_hours": "brain", "consecutive_nights_under_6h": "brain", "pvt_b_ms": "brain",
    "phq9": "brain", "phq9_item9": "brain", "gad7": "brain",
    "glucose_mg_dl": "metabolism",
    "body_temperature": "thermal",
    "radiation_rate_msv_day": "radiation", "spe_active": "radiation", "radiation_budget": "radiation",
    "bone": "bones", "ared_adherence": "bones",
    "sans": "eyes",
}
# sensor group of each variable (the groups of the simulator packet) and its system on the map
VAR_GROUP = {
    "heart_rate": "cardiovascular", "hrv_ms": "cardiovascular", "blood_pressure_systolic": "cardiovascular",
    "blood_pressure_diastolic": "cardiovascular", "spo2": "respiratory", "respiratory_rate": "respiratory",
    "body_temperature": "thermoregulation", "sleep_hours": "daily_assessment", "pvt_b_ms": "daily_assessment",
    "radiation_rate_msv_day": "radiation_dosimetry",
}
GROUP_SYSTEM = {"cardiovascular": "heart", "respiratory": "lungs", "thermoregulation": "thermal",
                "daily_assessment": "brain", "radiation_dosimetry": "radiation"}
GROUP_LABEL = {"cardiovascular": "Heart and blood pressure sensor", "respiratory": "Breathing sensor",
               "thermoregulation": "Temperature sensor", "daily_assessment": "Sleep and reaction-time test",
               "radiation_dosimetry": "Radiation dosimeter"}
for _group, _system in GROUP_SYSTEM.items():
    INDICATOR_SYSTEM[f"signal_{_group}"] = _system

VITAL_KEYS = ["heart_rate", "hrv_ms", "body_temperature", "blood_pressure_systolic", "blood_pressure_diastolic",
              "spo2", "respiratory_rate", "sleep_hours", "consecutive_nights_under_6h", "pvt_b_ms",
              "radiation_rate_msv_day", "cabin_co2_mmhg"]
BASELINE_KEY = {"heart_rate": "baseline_hr", "blood_pressure_systolic": "baseline_bp_systolic",
                "blood_pressure_diastolic": "baseline_bp_diastolic"}


def radiation_budget(profile: dict, mission_dose: float, rate: Optional[float], spe_active: bool,
                     spe_dose: Optional[float], last_spe_at: Optional[datetime], now: datetime) -> dict:
    agency = profile.get("agency")
    limit = AGENCY_DOSE_LIMIT_MSV.get(agency, DEFAULT_DOSE_LIMIT_MSV)
    prior = profile.get("prior_radiation_msv") or 0
    total = prior + mission_dose
    percent = round(total / limit * 100, 2)
    return {
        "agency": agency, "career_limit_msv": limit, "prior_msv": prior,
        "mission_msv": round(mission_dose, 2), "total_msv": round(total, 2),
        "percent_of_limit": percent, "rate_msv_day": rate,
        "solar_event_threshold_msv": SPE_DOSE_MSV,
        # The alert follows the event: on while it is active, off when it ends (the time stays in last_solar_event_at).
        "solar_event_alert": bool(spe_active or (spe_dose or 0) >= SPE_DOSE_MSV),
        "last_solar_event_at": last_spe_at,
    }


def build_dashboard(*, astronaut_id: str, now: datetime, telemetry: dict, manual: dict, profile: dict,
                    thresholds: dict, goals: dict, mission_dose: float, last_spe_at: Optional[datetime],
                    mission_day: Optional[int], countermeasures: list, signal: Optional[dict] = None,
                    sensors: Optional[dict] = None, link: Optional[dict] = None) -> dict:
    """Consolidate telemetry, the latest manual captures and the baseline into one view.

    telemetry: latest known value of every variable (+ "measured_at" and "meta", what the packet said about itself)
    manual: kind -> {"payload", "captured_at"} (latest of each kind)
    countermeasures: [{"payload", "captured_at"}] newest first (the log)
    link: {"link_up", "latency_seconds"} to evaluate the communication link (it does not change the crew level)
    """
    values = {k: telemetry.get(k) for k in VITAL_KEYS + ["spe_active", "spe_event_dose_msv",
                                                          "radiation_dose_msv", "crew_state"]}
    sources = {k: "telemetry" for k, v in values.items() if v is not None}
    signal, sensors = signal or {}, sensors or {}
    bp = manual.get("blood_pressure")
    if bp:  # blood pressure comes from the sensor and from the crew: the most recent one wins
        measured = telemetry.get("measured_at")
        for key, field in (("blood_pressure_systolic", "systolic"), ("blood_pressure_diastolic", "diastolic")):
            if values.get(key) is None or (measured and bp["captured_at"] > measured):
                values[key], sources[key] = bp["payload"][field], "manual"

    # The measurements and what the packet said about itself (activity since when, sensors with no signal) are judged
    # together by the rules of the indicators document. The findings of a sensor without signal come with them.
    result = classify({**values, "meta": telemetry.get("meta"), "measured_at": telemetry.get("measured_at")},
                      thresholds, profile)
    findings = list(result["findings"])
    for f in findings:
        f["source"] = sources.get(f["indicator"], "telemetry")

    # A sensor with a bad signal is listed apart; its values are NOT shown as current.
    data_quality = []
    for group, quality in signal.items():
        if quality == "good":
            continue
        data_quality.append({"group": group, "label": GROUP_LABEL.get(group, group), "quality": quality,
                             "sensor": sensors.get(group),
                             "variables": [k for k, g in VAR_GROUP.items() if g == group]})

    manual_view = {}
    for kind in ("glucose", "phq9", "gad7", "blood_pressure"):
        row = manual.get(kind)
        if not row:
            continue
        ev = evaluate_manual(kind, row["payload"], thresholds)
        manual_view[kind] = {**ev["payload"], "level": ev["level"], "captured_at": row["captured_at"]}
        if kind != "blood_pressure":  # blood pressure findings are already in `findings`
            findings += [{**f, "source": "manual"} for f in ev["findings"]]

    mission_total = values.get("radiation_dose_msv")
    radiation = radiation_budget(profile, mission_total if mission_total is not None else mission_dose,
                                 values.get("radiation_rate_msv_day"), bool(values.get("spe_active")),
                                 values.get("spe_event_dose_msv"), last_spe_at, now)
    dose_finding = evaluate_dose(radiation["percent_of_limit"], radiation["total_msv"])  # 60 / 80 / 100 % of the limit
    if dose_finding:
        findings.append({**dose_finding, "source": "computed"})

    week_ago = now - timedelta(days=7)
    week = [c for c in countermeasures if c["captured_at"] >= week_ago]
    kinds = [c["payload"].get("type") for c in week]
    blurred, headaches = kinds.count("blurred_vision"), kinds.count("headache")
    if blurred or headaches:
        level = "red" if blurred >= 3 else "orange" if (blurred or headaches >= 3) else "yellow"
        findings.append({**_finding("sans", "Head and vision symptoms (7 days)", blurred + headaches, "reports",
                                    level, "Report headaches or blurred vision to the flight surgeon. They can "
                                           "be linked to fluid shift in the head (SANS)."),
                         "source": "manual"})

    goal = goals.get("ared_sessions_per_week", 3)
    done = kinds.count("ared_session")
    if (mission_day or 0) >= 30 and done < goal:
        findings.append({**_finding("ared_adherence", "ARED sessions this week", done, f"of {goal}", "yellow",
                                    "Resistive exercise is behind the weekly goal. Plan the next ARED session "
                                    "to protect bone and muscle."), "source": "manual"})

    t = profile.get("dxa_t_score")
    if t is not None and t <= -1:
        level = "red" if t <= -2.5 else "orange" if t <= -2 else "yellow"
        findings.append({**_finding("bone", "Bone density (DXA T-score)", t, "", level,
                                    "Bone density is below the pre-flight reference. Keep up resistive exercise "
                                    "and calcium and vitamin D intake."), "source": "profile"})

    systems = []
    for key, (label, hazard) in SYSTEMS.items():
        drivers = [f for f in findings if INDICATOR_SYSTEM.get(f["indicator"]) == key]
        systems.append({"system": key, "label": label, "hazard": hazard,
                        "level": worst_level(f["level"] for f in drivers),
                        "drivers": [{"indicator": f["indicator"], "label": f["label"], "value": f["value"],
                                     "unit": f["unit"], "level": f["level"]} for f in drivers]})
    level = worst_level(s["level"] for s in systems)

    vitals = []
    for key in VITAL_KEYS:
        meta = BY_KEY[key]
        base = profile.get(BASELINE_KEY[key]) if key in BASELINE_KEY else None
        finding = next((f for f in findings if f["indicator"] == key), None)
        value = values.get(key)
        quality = signal.get(VAR_GROUP.get(key)) if sources.get(key) != "manual" else None
        vitals.append({"key": key, "label": meta["label"], "unit": meta["unit"], "value": value,
                       "source": sources.get(key), "signal_quality": quality,
                       "no_signal": value is None and quality == "lost", "baseline": base,
                       "vs_baseline": round(value - base, 1) if (value is not None and base is not None) else None,
                       "level": finding["level"] if finding else ("green" if value is not None else None)})

    # Immediate-action guides, the worst first: what is wrong, the recommended action and the procedure.
    guides = []
    for f in sorted(findings, key=lambda f: -["green", "yellow", "orange", "red"].index(f["level"])):
        if f["level"] != "green":
            guides.append({"id": f["indicator"], "title": f["label"], "level": f["level"], "level_name": f["level_name"],
                           "message": f["message"], "action": f["action"],
                           "steps": f["procedure"] or [f["advice"]]})

    return {
        "astronaut_id": astronaut_id, "generated_at": now, "level": level, "level_name": LEVEL_NAME[level],
        "status": LEVEL_TO_STATUS[level], "measured_at": telemetry.get("measured_at"),
        "link": evaluate_link(link.get("latency_seconds"), link.get("link_up", True)) if link else None,
        "environment": {"cabin_co2_mmhg": values.get("cabin_co2_mmhg"), "crew_state": values.get("crew_state"),
                        "mission_day": mission_day},
        "vitals": vitals, "data_quality": data_quality, "manual_latest": manual_view, "radiation": radiation,
        "bone_loss_estimate_percent": round((mission_day or 0) / 30 * 1.0, 1),
        "systems": systems, "guides": guides, "findings": findings,
    }
