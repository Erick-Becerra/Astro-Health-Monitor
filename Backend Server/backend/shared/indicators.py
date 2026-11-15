"""Clinical rules of the monitor: what each value means (Normal, Caution, Moderate risk, Critical),
and what to say and do about it.

Source: the document "Health Indicators Structure - Astro Health Monitor (Telemetry v1.1)". The ranges, the
messages and the procedures are the ones of that document, section by section. Where the document leaves a gap,
this file fills it and says so with the word PROPOSED in `criteria`. All of it has to be validated by the
medical team / flight surgeon before real use. docs/indicators.md is written from this file.

Levels:  green = Normal · yellow = Caution · orange = Moderate risk · red = Critical.
"""
import math
from datetime import datetime
from typing import Optional

INF = math.inf
LEVEL_ORDER = {"green": 0, "yellow": 1, "orange": 2, "red": 3}
LEVEL_NAME = {"green": "Normal", "yellow": "Caution", "orange": "Moderate risk", "red": "Critical"}
LEVEL_TO_STATUS = {"green": "ok", "yellow": "attention", "orange": "attention", "red": "critical"}


def le(x: float) -> float:
    """'Up to and including x' written as a limit for `low <= value < high`."""
    return math.nextafter(x, INF)


def _c(criteria: str, action: str, message: str, *procedure: str) -> dict:
    """One entry of the document: the value, the recommended action, the simulator message and the procedure.
    In `message`, {x} and {y} are the measured values."""
    return {"criteria": criteria, "action": action, "message": message, "procedure": list(procedure)}


# ====================================================================== content (the document, by section)
CONTENT: dict[str, dict[str, dict]] = {
    # ---- 1. Cabin CO2 ----------------------------------------------------------------------------------
    "co2": {
        "green": _c("CO₂ < 2.3 mmHg", "Continue normal operation.", "Cabin CO₂ nominal ({x} mmHg).",
                    "Continuous logging in the logbook."),
        "yellow": _c("CO₂ 2.3 – 2.9 mmHg", "Check ventilation and air scrubbing.",
                     "Elevated CO₂ ({x} mmHg). Possible mild headache or fatigue. Check ventilation.",
                     "Verify airflow is not blocked.", "Check the status of the CO₂ scrubbers.",
                     "Ask the crew about headache or fatigue.", "Reduce physical effort in the area.",
                     "Repeat the reading in 30 min."),
        "orange": _c("CO₂ 3.0 – 5.2 mmHg", "Operational limit exceeded; correct immediately.",
                     "CO₂ above operational limit ({x} mmHg). Fix ventilation and limit activity.",
                     "Notify Mission Control.", "Activate or replace backup scrubbers.",
                     "Suspend intense exercise.", "Move to a module with lower CO₂.",
                     "Monitor symptoms (headache, dizziness, shortness of breath) every 15 min."),
        "red": _c("CO₂ ≥ 5.3 mmHg", "Atmosphere emergency.",
                  "CRITICAL ALERT: CO₂ ≥ 5.3 mmHg. Crew at risk. Activate emergency protocol.",
                  "Sound the alarm for the whole crew.", "Isolate the affected module.",
                  "Use backup air supply / equipment.", "Assess symptoms in each crew member.",
                  "Contact Mission Control.", "Evaluate moving to a safe module or returning."),
    },
    # ---- 2A. Heart rate at rest (resting, working, post_exercise_recovery after 30 min) -------------------
    "hr_rest": {
        "green": _c("Resting HR 60 – 100 bpm (usual in space: 60–75)", "Continue routine.",
                    "Resting heart rate normal ({x} bpm).", "Continuous logging. Update the personal baseline."),
        "yellow": _c("Resting HR 50 – 59 bpm or 101 – 110 bpm",
                     "Review hydration, sleep, stress and aerobic exercise compliance.",
                     "Resting HR outside usual range ({x} bpm). Check hydration, rest and exercise load.",
                     "Confirm the crew member is truly at rest (5 min).", "Check hydration and caffeine intake.",
                     "Cross-check with sleep hours and stress.", "Repeat the measurement in 15 min."),
        "orange": _c("Resting HR > 110 bpm sustained", "Alert the medical team.",
                     "Sustained resting tachycardia ({x} bpm). Notify the medical officer.",
                     "Have the crew member sit/restrained at rest.", "Take BP, temperature and SpO₂.",
                     "Ask about chest pain, dizziness, palpitations.", "Rule out fever, dehydration and anxiety.",
                     "Notify the crew medical officer and Mission Control.", "Repeat every 10 min."),
        "red": _c("Resting HR < 40 bpm, or > 130 bpm with symptoms (the backend cannot see the symptoms, so it "
                  "treats every resting HR > 130 as critical: PROPOSED)", "Cardiac emergency.",
                  "CRITICAL ALERT: HR {x} bpm with risk of cardiac compromise. Activate medical emergency protocol.",
                  "Stop all activity.", "Place the crew member in a comfortable, supervised position.",
                  "Obtain an ECG if available.", "Measure BP and SpO₂.",
                  "Contact Mission Control and the medical officer.", "Prepare emergency medical equipment."),
        # not in the document: resting HR 40 - 49 (between the yellow and the red band)
        "orange_low": _c("Resting HR 40 – 49 bpm (PROPOSED: the document has no band between 50 and 40)",
                         "Alert the medical team.",
                         "Low resting heart rate ({x} bpm). Notify the medical officer.",
                         "Confirm the crew member is truly at rest (5 min).", "Check the sensor fit.",
                         "Take BP, temperature and SpO₂.", "Ask about dizziness, fatigue and fainting.",
                         "Notify the crew medical officer.", "Repeat every 10 min."),
    },
    # ---- 2B. Heart rate during sleep ---------------------------------------------------------------------
    "hr_sleep": {
        "green": _c("Sleep HR 40 – 55 bpm", "No action.", "Heart rate during sleep normal ({x} bpm).",
                    "Continuous logging."),
        "yellow": _c("Sleep HR 56 – 70 bpm or 35 – 39 bpm", "Review sleep quality and stress.",
                     "Heart rate during sleep slightly altered ({x} bpm). Possible fragmented sleep or stress.",
                     "Review sleep hours and awakenings.", "Check light and noise in the sleep module.",
                     "Repeat the next day."),
        "orange": _c("Sleep HR 71 – 100 bpm or 30 – 34 bpm", "Evaluate on waking.",
                     "Abnormal heart rate during sleep ({x} bpm). Medical evaluation recommended on waking.",
                     "Verify the sensor (placement / fit).", "On waking, measure HR, BP, SpO₂.",
                     "Ask about apnea, nightmares, discomfort.", "Notify the physician."),
        "red": _c("Sleep HR > 100 bpm sustained or < 30 bpm", "Wake and evaluate immediately.",
                  "CRITICAL ALERT: heart rate during sleep {x} bpm. Wake and evaluate the crew member.",
                  "Wake the crew member.", "Assess consciousness and breathing.",
                  "Measure BP, SpO₂ and temperature.", "Contact Mission Control.", "Activate the medical protocol."),
    },
    # ---- 2C. Heart rate during activity (exercising, eva; first 30 min of post_exercise_recovery) ----------
    "hr_activity": {
        "green": _c("Activity HR ≤ 160 bpm (expected 95–160; below 95 = light effort)", "Continue activity.",
                    "Heart rate during activity in range ({x} bpm).", "Continuous logging; maintain hydration."),
        "yellow": _c("Activity HR 161 – 170 bpm", "Reduce intensity.",
                     "High heart rate during activity ({x} bpm). Reduce intensity.",
                     "Slow the pace.", "Hydrate.", "Check core temperature.", "If it drops within 2 min, continue."),
        "orange": _c("Activity HR 171 – 185 bpm", "Stop the effort and recover.",
                     "Very high heart rate ({x} bpm). Stop intense activity and rest.",
                     "Stop the exercise / maneuver.", "Rest and monitor.", "Measure BP and temperature.",
                     "If HR does not fall below 120 bpm in 5 min, notify the physician.",
                     "During EVA: tell Mission Control to return."),
        "red": _c("Activity HR > 185 bpm, or any value with chest pain, dizziness or fainting",
                  "Suspend and treat immediately.",
                  "CRITICAL ALERT: HR {x} bpm during activity. Suspend everything and activate medical protocol.",
                  "Suspend activity / EVA and return to a safe area.", "Rest; rule out hyperthermia (see core temperature after activity).",
                  "ECG / BP / SpO₂.", "Contact Mission Control.", "Prepare medical emergency."),
    },
    # ---- 3. Blood pressure (final colour = the worst component) -----------------------------------------
    "bp": {
        "green": _c("Systolic 100 – 119 and diastolic 65 – 79", "Normal logging.",
                    "Blood pressure nominal ({x}/{y} mmHg).", "Continuous logging; stable adaptation to microgravity."),
        "yellow": _c("Systolic 120 – 139 or diastolic 80 – 89; or low: systolic 90 – 99 or diastolic 60 – 64",
                     "Review hydration, exercise (ARED) and fluid shift toward the head.",
                     "Blood pressure outside optimal range ({x}/{y} mmHg). Check hydration and exercise load.",
                     "Repeat at rest after 5 min, arm at heart level.", "Check hydration and sodium.",
                     "Review exercise load.", "Repeat in 1–2 h."),
        "orange": _c("Systolic 140 – 179 or diastolic 90 – 119; or low: systolic 80 – 89 or diastolic 50 – 59",
                     "Alert the medical team; evaluate SANS and orthostatic intolerance.",
                     "Blood pressure at risk ({x}/{y} mmHg). Notify the medical team.",
                     "Confirm with a second measurement.",
                     "Ask about headache, blurred vision (SANS), dizziness on standing.",
                     "Measure HR, SpO₂ and temperature.",
                     "High: rest and avoid exertion. Low: lie down / raise legs and rehydrate.",
                     "Notify the physician.", "Repeat every 15 min."),
        "red": _c("Systolic ≥ 180 or diastolic ≥ 120; or low: systolic < 80 or diastolic < 50",
                  "Immediate intervention.",
                  "CRITICAL ALERT: Blood pressure {x}/{y} mmHg. Activate medical emergency protocol.",
                  "Stop all activity.", "Supine position and continuous supervision.",
                  "Confirm with a second measurement.", "Look for signs of stroke, heart attack or shock.",
                  "Contact Mission Control.", "Activate the emergency protocol / negative-pressure countermeasures."),
    },
    # ---- 4. SpO2 ------------------------------------------------------------------------------------------
    "spo2": {
        "green": _c("SpO₂ ≥ 95 %", "No action.", "Oxygen saturation normal ({x} %).", "Continuous logging."),
        "yellow": _c("SpO₂ 92 – 94 %", "Check the sensor and air quality.",
                     "SpO₂ slightly low ({x} %). Check the sensor and cabin CO₂.",
                     "Verify sensor placement / fit.", "Check CO₂ and ventilation.", "Ask for deep breaths and repeat."),
        "orange": _c("SpO₂ 88 – 91 %", "Alert the physician.", "Low SpO₂ ({x} %). Notify the medical officer.",
                     "Confirm with another sensor.", "Check the cabin atmosphere (O₂, CO₂).",
                     "Assess shortness of breath, cyanosis, dizziness.", "Rest.",
                     "Notify the physician and repeat every 5–10 min."),
        "red": _c("SpO₂ < 88 %", "Respiratory emergency.",
                  "CRITICAL ALERT: SpO₂ {x} %. Possible hypoxia. Activate emergency protocol.",
                  "Give supplemental oxygen if available.", "Verify the cabin atmosphere.",
                  "Assess airway and breathing.", "Contact Mission Control.", "Prepare medical emergency."),
    },
    # ---- 5. Respiratory rate -------------------------------------------------------------------------------
    "resp": {
        "green": _c("12 – 20 rpm", "No action.", "Respiratory rate normal ({x} rpm).", "Continuous logging."),
        "yellow": _c("10 – 11 or 21 – 24 rpm", "Check CO₂, stress and recent exertion.",
                     "Respiratory rate slightly altered ({x} rpm). Check cabin CO₂ and stress level.",
                     "Confirm rest.", "Check CO₂.", "Ask for slow breathing and repeat."),
        "orange": _c("8 – 9 or 25 – 29 rpm", "Alert the physician.",
                     "Abnormal respiratory rate ({x} rpm). Notify the medical team.",
                     "Measure SpO₂ and HR.", "Check the atmosphere.", "Assess shortness of breath and anxiety.",
                     "Notify the physician."),
        "red": _c("< 8 or ≥ 30 rpm", "Respiratory emergency.",
                  "CRITICAL ALERT: Respiratory rate {x} rpm. Activate emergency protocol.",
                  "Assess the airway.", "Supplemental oxygen.", "Measure SpO₂.", "Contact Mission Control.",
                  "Prepare medical emergency."),
    },
    # ---- 6A. Core temperature at rest ----------------------------------------------------------------------
    "temp_rest": {
        "green": _c("36.1 – 37.2 °C", "No action.", "Core temperature normal ({x} °C).", "Continuous logging."),
        "yellow": _c("37.3 – 37.9 °C", "Hydrate and monitor.", "Temperature slightly elevated ({x} °C). Hydrate and monitor.",
                     "Hydrate.", "Check cabin ventilation / temperature.", "Repeat in 30 min."),
        "orange": _c("38.0 – 38.9 °C", "Possible fever or hyperthermia: alert the physician.",
                     "Elevated temperature ({x} °C). Possible fever or hyperthermia. Notify the medical team.",
                     "Remove clothing layers / increase local ventilation.", "Hydrate.",
                     "Look for symptoms of infection.", "Notify the physician.", "Repeat every 15 min."),
        "red": _c("≥ 39.0 °C, or with severe symptoms (confusion, dizziness, fainting)", "Heat / fever emergency.",
                  "CRITICAL ALERT: Temperature {x} °C. Risk of heat stroke. Activate emergency protocol.",
                  "Active cooling (cold cloths, ventilation).", "Hydrate if conscious.",
                  "Monitor consciousness, HR and BP.", "Contact Mission Control.", "Prepare medical emergency."),
        # not in the document: low temperature
        "yellow_low": _c("35.0 – 36.0 °C (PROPOSED: the document has no band below 36.1)", "Warm up and monitor.",
                         "Temperature slightly low ({x} °C). Add a layer and monitor.",
                         "Add a layer of clothing.", "Check cabin temperature.", "Repeat in 30 min."),
        "red_low": _c("< 35.0 °C (PROPOSED: the document has no band below 36.1)", "Hypothermia: emergency.",
                      "CRITICAL ALERT: Temperature {x} °C. Risk of hypothermia. Activate emergency protocol.",
                      "Warm the crew member gradually.", "Check the sensor.", "Monitor consciousness, HR and BP.",
                      "Contact Mission Control.", "Prepare medical emergency."),
    },
    # ---- 6B. Core temperature after activity (exercising, eva, first 30 min of post_exercise_recovery) ------
    "temp_activity": {
        "green": _c("< 38.5 °C", "Continue.", "Temperature after activity normal ({x} °C).",
                    "Hydrate and cool down normally."),
        "yellow": _c("38.5 – 39.4 °C", "Reduce intensity and cool down.",
                     "High temperature after activity ({x} °C). Reduce intensity and hydrate.",
                     "Lower intensity.", "Hydrate.", "Direct ventilation.", "Measure again at 15 min."),
        "orange": _c("39.5 – 39.9 °C, or > 38.0 °C that does not drop after 30 min of rest (that case is "
                     "caught by the at-rest scale once the 30 minutes have passed)",
                     "Stop exercise and cool down.", "Risk of hyperthermia ({x} °C). Stop activity and cool down.",
                     "Stop exercise / EVA.", "Active cooling.", "Hydration.", "Notify the physician.",
                     "Measure every 10 min."),
        "red": _c("≥ 40.0 °C, or with confusion, dizziness or fainting", "Heat stroke: emergency.",
                  "CRITICAL ALERT: Temperature {x} °C. Probable heat stroke. Activate emergency protocol.",
                  "Suspend activity immediately.", "Aggressive cooling (packs on neck, armpits, groin).",
                  "Watch consciousness and airway.", "Contact Mission Control.", "Medical emergency."),
    },
    # ---- 7. Sleep (needs the history of nights) ------------------------------------------------------------
    "sleep": {
        "green": _c("≥ 7 h", "Maintain sleep routine.", "Adequate sleep ({x} h).",
                    "Logging; keep the protected 8.5 h block."),
        "yellow": _c("6.0 – 6.9 h (or < 6 h on a single night)", "Improve sleep hygiene.",
                     "Sleep below recommended ({x} h). Review your rest routine.",
                     "Avoid bright light before sleeping (sunrises in the cupola).",
                     "Reduce pending tasks before bed.", "Check noise and temperature.",
                     "Re-evaluate the next night."),
        "orange": _c("< 6 h for 2 consecutive nights", "Adjust workload and watch performance.",
                     "Accumulated sleep deficit ({n} nights < 6 h). Risk of errors and higher stress.",
                     "Reduce critical tasks for 24 h.", "Protect an extra rest block.", "Run the PVT test.",
                     "Review stress / mood.", "Inform the physician."),
        "red": _c("< 4 h for 3 consecutive nights", "Evaluate fitness for critical tasks.",
                  "CRITICAL ALERT: severe sleep deprivation (3 nights < 4 h). Do not perform critical tasks.",
                  "Exclude from EVA and critical tasks.", "Medical and psychological evaluation.",
                  "Supervised sleep recovery plan.", "Notify Mission Control."),
    },
    # ---- 8. PVT reaction time (relative to the astronaut's own baseline) -----------------------------------
    "pvt": {
        "green": _c("≤ baseline + 10 %", "No action.", "Reaction time within normal range ({x} ms).",
                    "Repeat every 4 days (as in the study)."),
        "yellow": _c("+10 % to +25 % over baseline", "Review sleep and fatigue.",
                     "Reaction slightly slower ({x} ms). Check your rest and fatigue.",
                     "Cross-check with sleep hours.", "Avoid precision tasks for a few hours.", "Repeat the test."),
        "orange": _c("+25 % to +50 % over baseline", "Limit critical tasks.",
                     "Clearly slow reaction ({x} ms). Limit critical tasks.",
                     "Postpone risky tasks.", "Take a break or rest.", "Repeat after resting.", "Inform the physician."),
        "red": _c("> +50 % over baseline", "Not fit for critical tasks.",
                  "CRITICAL ALERT: very slow reaction ({x} ms). Not fit for critical tasks or EVA.",
                  "Remove from critical tasks.", "Medical evaluation (sleep, CO₂, glucose, mood).",
                  "Recovery plan.", "Notify Mission Control."),
    },
    # ---- 9. Daily radiation rate ---------------------------------------------------------------------------
    "rad_rate": {
        "green": _c("≤ 0.5 mSv/day", "No action.", "Daily radiation rate normal ({x} mSv/day).",
                    "Add the dose to the career record."),
        "yellow": _c("0.51 – 1.0 mSv/day", "Review shielding and exposure.",
                     "Radiation rate above usual ({x} mSv/day).",
                     "Review work areas and time spent in poorly shielded zones.", "Verify dosimeters.",
                     "Report to Mission Control."),
        "orange": _c("1.1 – 2.0 mSv/day", "Limit exposure.", "High radiation rate ({x} mSv/day). Limit exposure.",
                     "Stay in shielded zones.", "Suspend non-essential EVA.", "Notify Mission Control.",
                     "Review accumulated dose."),
        "red": _c("> 2.0 mSv/day", "Immediate shelter.",
                  "CRITICAL ALERT: radiation {x} mSv/day. Take shelter in a shielded zone.",
                  "Move to the shelter.", "Cancel EVA.", "Contact Mission Control.",
                  "Record symptoms (nausea, dizziness)."),
    },
    # ---- 10. Solar particle event --------------------------------------------------------------------------
    "spe": {
        "green": _c("active = false, dose = 0", "No action.", "No active solar event.", "Continuous watch."),
        "yellow": _c("active = true, dose < 100 mSv", "Prepare to shelter.",
                     "Solar event active ({x} mSv). Prepare to take shelter.",
                     "Suspend EVA.", "Locate the shielded zone.", "Monitor the dose every 15 min."),
        "orange": _c("active = true, dose 100 – 249 mSv", "Shelter now.",
                     "Solar event with high dose ({x} mSv). Take shelter in the shielded zone.",
                     "Move to the shelter.", "Close access to unshielded areas.", "Notify Mission Control.",
                     "Record symptoms."),
        "red": _c("dose ≥ 250 mSv", "Per-event limit reached.",
                  "CRITICAL ALERT: event dose ≥ 250 mSv. Risk of acute effects.",
                  "Remain in the shelter.", "Medical evaluation (nausea, vomiting, fatigue).",
                  "Contact Mission Control.", "Record the dose in the medical file."),
    },
    # ---- 11. Accumulated dose, % of the career limit (derived) ---------------------------------------------
    "dose": {
        "green": _c("< 60 % of the career limit", "No action.",
                    "Accumulated dose within margin ({x} mSv, {y} %).", "Continuous logging."),
        "yellow": _c("60 – 80 % of the career limit", "Plan future missions carefully.",
                     "Accumulated dose at 60–80 % of the limit ({x} mSv).",
                     "Inform the astronaut.", "Review exposure planning."),
        "orange": _c("80 – 99 % of the career limit", "Limit future exposure.",
                     "Accumulated dose near the limit ({x} mSv, {y} %).",
                     "Restrict EVA.", "Medical review.", "Evaluate crew rotation."),
        "red": _c("≥ 100 % of the career limit", "Career limit reached.",
                  "CRITICAL ALERT: career radiation limit reached ({x} mSv).",
                  "Remove from future exposure.", "Medical evaluation.", "Notify Mission Control."),
    },
    # ---- 12. Communication latency -------------------------------------------------------------------------
    "latency": {
        "green": _c("≤ 3 s", "Near real-time consultation.", "Communication with Earth normal ({x} s).",
                    "No changes."),
        "yellow": _c("3.1 – 14 s", "Use clear messages; do not depend on instant replies.",
                     "Operational latency ({x} s). Confirm critical messages.",
                     "Send short, confirmable messages.", "Prioritize medical autonomy for fast decisions."),
        "orange": _c("> 14 s", "Operate with medical autonomy.",
                     "High latency ({x} s). Use the medical autonomy rules.",
                     "Follow the procedures in this document without waiting for a reply.",
                     "Send a report and continue."),
        "red": _c("No communication link", "Full autonomy.",
                  "CRITICAL ALERT: no communication with Earth. Operate under autonomy protocol.",
                  "Apply local protocols.", "Retry the link periodically.",
                  "Log everything to transmit once restored."),
    },
    # ---- 13. Signal quality (checked before any other section) ---------------------------------------------
    "signal": {
        "green": _c("good", "Use the value.", "", "Classify normally."),
        "yellow": _c("degraded", "Use the value with caution and re-seat the sensor.",
                     "Degraded signal on {sensor}. The value may not be accurate.",
                     "Re-seat the sensor.",
                     "In microgravity, optical wrist sensors can vary: prefer a chest ECG or calibrated cuff.",
                     "Repeat the measurement."),
        "orange": _c("lost on a non-vital variable (sleep, PVT)", "Do not evaluate; recover the data.",
                     "No signal on {sensor}. No data to evaluate.",
                     "Check battery / connection.", "Take a manual measurement if possible.",
                     "Record the gap in the logbook."),
        "red": _c("lost on a vital variable (HR, BP, SpO₂, temperature) for more than 5 min",
                  "Switch to manual measurement.",
                  "ALERT: signal lost on {sensor}. Manual measurement required.",
                  "Measure manually (cuff, pulse oximeter, thermometer).", "Replace the sensor.",
                  "Notify Mission Control."),
        # not in the document: lost on a vital variable for LESS than 5 minutes
        "yellow_lost_short": _c("lost on a vital variable for less than 5 min (PROPOSED: the document only gives "
                                "the case of more than 5 min)", "Re-seat the sensor; measure by hand if it lasts.",
                                "Signal lost on {sensor} for less than 5 min. Re-seat the sensor.",
                                "Re-seat the sensor.", "Measure manually if the signal does not return in 5 min."),
    },
    # ---- 14. PHQ-9 -------------------------------------------------------------------------------------------
    "phq9": {
        "green": _c("PHQ-9 total 0 – 4 and item 9 = 0 (minimal or none)", "Normal operation; no intervention.",
                    "Mood screening normal (PHQ-9: {x}/27). No action needed.",
                    "Log the result.", "Repeat at the next scheduled assessment (every 2 weeks)."),
        "yellow": _c("PHQ-9 total 5 – 9 and item 9 = 0 (mild symptoms)",
                     "Preventive observation; review sleep hygiene and workload; repeat in 1–2 weeks.",
                     "Mild mood symptoms (PHQ-9: {x}/27). Review your sleep, workload and routine. The test will "
                     "be repeated in 1–2 weeks.",
                     "Cross-check items 3 and 4 with real sleep data; if tiredness explains the score, note it "
                     "before escalating.",
                     "Review workload, rest time and social contact with the crew.",
                     "Encourage communication with family / psychological support on Earth.",
                     "Repeat the PHQ-9 in 1–2 weeks.", "If the score stays the same or rises, move to the Orange protocol."),
        "orange": _c("PHQ-9 total 10 – 14 and item 9 = 0 (moderate symptoms)",
                     "Priority attention: private evaluation with a mental health specialist and adjustment of "
                     "tasks and rest time.",
                     "Moderate mood symptoms (PHQ-9: {x}/27). A private evaluation with a mental health specialist "
                     "is recommended and your tasks may be adjusted.",
                     "Notify the crew medical officer (private).",
                     "Schedule a private consultation with behavioral health (via Mission Control if no specialist is on board).",
                     "Build a treatment plan: counseling, follow-up and, if the physician considers it, medication.",
                     "Adjust tasks and protect rest time.", "Check sleep, GAD-7 and the PVT test.",
                     "Repeat the PHQ-9 every week."),
        "red": _c("PHQ-9 total 15 – 19 and item 9 = 0 (moderately severe symptoms)",
                  "Immediate medical and psychological intervention; evaluate fitness for critical tasks.",
                  "CRITICAL ALERT: PHQ-9 {x}/27 (moderately severe). Medical and psychological intervention "
                  "required. Fitness for critical tasks will be evaluated.",
                  "Notify the medical officer and Mission Control immediately.",
                  "Start active treatment (psychotherapy and/or medication, as decided by the physician).",
                  "Evaluate fitness for EVA and other critical tasks; restrict them if needed.",
                  "Increase supervision and contact with the crew.",
                  "Repeat the PHQ-9 weekly and review the GAD-7 and sleep."),
        "red_severe": _c("PHQ-9 total 20 – 27 and item 9 = 0 (severe symptoms)",
                         "Immediate start of medical treatment and urgent referral to mental health specialists.",
                         "CRITICAL ALERT: PHQ-9 {x}/27 (severe). Immediate treatment and urgent mental health "
                         "consultation required.",
                         "Notify the medical officer and Mission Control immediately.",
                         "Start pharmacotherapy per the physician's decision.",
                         "Urgent referral to a mental health specialist (psychotherapy and/or collaborative management), by remote link if needed.",
                         "Remove from critical tasks and EVA until cleared.",
                         "Continuous crew support; do not leave the person isolated.",
                         "Evaluate the mission plan (rotation / early return) with Mission Control."),
        "red_item9": _c("PHQ-9 item 9 ≥ 1 (thoughts of being better off dead or of self-harm), any total",
                        "Immediate suicide-risk evaluation by a trained professional.",
                        "CRITICAL ALERT: your answer to question 9 needs immediate attention. The medical and "
                        "behavioral health team has been notified and will contact you now. You are not alone.",
                        "Do not leave the crew member alone; a crew member stays with them.",
                        "Immediately notify the medical officer and Mission Control (behavioral health).",
                        "A trained professional performs a suicide-risk assessment (in person or by remote link) as soon as possible.",
                        "Secure access to anything on board that could be used for self-harm (medications, tools).",
                        "Remove from critical tasks and EVA until cleared.",
                        "Follow-up check-ins and a written safety plan defined by the specialist."),
    },
    # ---- 15. GAD-7 -------------------------------------------------------------------------------------------
    "gad7": {
        "green": _c("GAD-7 total 0 – 4 (minimal anxiety)", "No intervention.",
                    "Anxiety screening normal (GAD-7: {x}/21).",
                    "Log the result.", "Repeat at the next scheduled assessment (every 2 weeks)."),
        "yellow": _c("GAD-7 total 5 – 9 (mild anxiety)",
                     "Preventive observation; review stress sources, sleep and workload; repeat in 1–2 weeks.",
                     "Mild anxiety symptoms (GAD-7: {x}/21). Review stress sources, sleep and workload.",
                     "Review recent stressors (tasks, isolation, crew conflict, communication delay).",
                     "Cross-check with sleep and resting heart rate.",
                     "Suggest relaxation and breathing exercises, and exercise per the schedule.",
                     "If total is 8 or more: flag as a probable case (cutoff of 8 = sensitivity 92 %, specificity 76 %) "
                     "and recommend a further assessment by the medical officer.",
                     "Repeat the GAD-7 in 1–2 weeks."),
        "orange": _c("GAD-7 total 10 – 14 (moderate anxiety)",
                     "Priority attention: private evaluation by a mental health specialist.",
                     "Moderate anxiety symptoms (GAD-7: {x}/21). A private evaluation is recommended.",
                     "Notify the medical officer (private).", "Schedule a consultation with behavioral health.",
                     "A score of 10 or more also screens for panic disorder, social anxiety and PTSD; ask the specialist to evaluate them.",
                     "Adjust workload; protect rest.", "Check PHQ-9 and sleep.", "Repeat the GAD-7 every week."),
        "red": _c("GAD-7 total 15 – 21 (severe anxiety)",
                  "Immediate medical and psychological intervention; evaluate fitness for critical tasks.",
                  "CRITICAL ALERT: GAD-7 {x}/21 (severe anxiety). Medical and psychological intervention required.",
                  "Notify the medical officer and Mission Control immediately.",
                  "Assess for panic symptoms (rapid heartbeat, shortness of breath, fear); measure HR, BP and SpO₂ to rule out physical causes.",
                  "Specialist evaluation and treatment plan (psychotherapy and/or medication per the physician).",
                  "Evaluate fitness for EVA and other critical tasks; restrict if needed.",
                  "Continuous crew support; repeat the GAD-7 weekly and review the PHQ-9."),
    },
}

# ================================================================ ranges: value -> level (by context)
# (level, low, high, side, content key). A value is in the band when low <= value < high.
# side: "ok" (normal), "low" or "high" (which side of normal it is). Personal thresholds replace the "high" bands.
RANGES: dict[str, list[tuple]] = {
    "co2": [("green", -INF, 2.3, "ok", None), ("yellow", 2.3, 3.0, "high", None),
            ("orange", 3.0, 5.3, "high", None), ("red", 5.3, INF, "high", None)],
    "hr_rest": [("red", -INF, 40, "low", None), ("orange", 40, 50, "low", "orange_low"), ("yellow", 50, 60, "low", None),
                ("green", 60, 101, "ok", None), ("yellow", 101, 111, "high", None),
                ("orange", 111, 131, "high", None), ("red", 131, INF, "high", None)],
    "hr_sleep": [("red", -INF, 30, "low", None), ("orange", 30, 35, "low", None), ("yellow", 35, 40, "low", None),
                 ("green", 40, 56, "ok", None), ("yellow", 56, 71, "high", None),
                 ("orange", 71, 101, "high", None), ("red", 101, INF, "high", None)],
    "hr_activity": [("green", -INF, 161, "ok", None), ("yellow", 161, 171, "high", None),
                    ("orange", 171, 186, "high", None), ("red", 186, INF, "high", None)],
    "bp_sys": [("red", -INF, 80, "low", None), ("orange", 80, 90, "low", None), ("yellow", 90, 100, "low", None),
               ("green", 100, 120, "ok", None), ("yellow", 120, 140, "high", None),
               ("orange", 140, 180, "high", None), ("red", 180, INF, "high", None)],
    "bp_dia": [("red", -INF, 50, "low", None), ("orange", 50, 60, "low", None), ("yellow", 60, 65, "low", None),
               ("green", 65, 80, "ok", None), ("yellow", 80, 90, "high", None),
               ("orange", 90, 120, "high", None), ("red", 120, INF, "high", None)],
    "spo2": [("red", -INF, 88, "low", None), ("orange", 88, 92, "low", None), ("yellow", 92, 95, "low", None),
             ("green", 95, INF, "ok", None)],
    "resp": [("red", -INF, 8, "low", None), ("orange", 8, 10, "low", None), ("yellow", 10, 12, "low", None),
             ("green", 12, 21, "ok", None), ("yellow", 21, 25, "high", None),
             ("orange", 25, 30, "high", None), ("red", 30, INF, "high", None)],
    "temp_rest": [("red", -INF, 35.0, "low", "red_low"), ("yellow", 35.0, 36.1, "low", "yellow_low"),
                  ("green", 36.1, 37.3, "ok", None), ("yellow", 37.3, 38.0, "high", None),
                  ("orange", 38.0, 39.0, "high", None), ("red", 39.0, INF, "high", None)],
    "temp_activity": [("green", -INF, 38.5, "ok", None), ("yellow", 38.5, 39.5, "high", None),
                      ("orange", 39.5, 40.0, "high", None), ("red", 40.0, INF, "high", None)],
    "rad_rate": [("green", -INF, le(0.5), "ok", None), ("yellow", le(0.5), le(1.0), "high", None),
                 ("orange", le(1.0), le(2.0), "high", None), ("red", le(2.0), INF, "high", None)],
    "dose": [("green", -INF, 60, "ok", None), ("yellow", 60, 80, "high", None),
             ("orange", 80, 100, "high", None), ("red", 100, INF, "high", None)],
    "latency": [("green", -INF, le(3), "ok", None), ("yellow", le(3), le(14), "high", None),
                ("orange", le(14), INF, "high", None)],
    # PVT is judged on the ratio to the astronaut's own baseline (value / baseline)
    "pvt": [("green", -INF, le(1.10), "ok", None), ("yellow", le(1.10), le(1.25), "high", None),
            ("orange", le(1.25), le(1.50), "high", None), ("red", le(1.50), INF, "high", None)],
}

DEFAULT_BASELINE_PVT_MS = 300  # used when the astronaut has no baseline_pvt_ms in the record (PROPOSED)
VITAL_GROUPS = ("cardiovascular", "respiratory", "thermoregulation")  # lost signal here is serious
LOST_RED_AFTER_MINUTES = 5

# ---- public indicator -> (label, unit, range table(s) that personal thresholds can adjust)
LABEL = {
    "cabin_co2_mmhg": ("Cabin CO2", "mmHg"), "heart_rate": ("Heart rate", "bpm"),
    "blood_pressure_systolic": ("Systolic pressure", "mmHg"), "blood_pressure_diastolic": ("Diastolic pressure", "mmHg"),
    "spo2": ("Oxygen saturation", "%"), "respiratory_rate": ("Respiratory rate", "rpm"),
    "body_temperature": ("Body temperature", "°C"), "sleep_hours": ("Sleep last night", "h"),
    "pvt_b_ms": ("Reaction time (PVT-B)", "ms"), "radiation_rate_msv_day": ("Radiation rate", "mSv/day"),
    "spe_active": ("Solar particle event", "mSv"),
}
# Personal thresholds (set from Earth) replace the "high" side of these tables: at rest for heart rate and temperature.
ADJUSTABLE_TABLE = {
    "heart_rate": "hr_rest", "body_temperature": "temp_rest", "blood_pressure_systolic": "bp_sys",
    "blood_pressure_diastolic": "bp_dia", "respiratory_rate": "resp", "cabin_co2_mmhg": "co2",
    "radiation_rate_msv_day": "rad_rate",
}
ADJUSTABLE = list(ADJUSTABLE_TABLE)


def adjustable_defaults(indicator: str) -> dict:
    """The default thresholds {yellow, orange, red} of an adjustable indicator: the value from which each colour starts."""
    out = {}
    for level, low, _high, side, _key in RANGES[ADJUSTABLE_TABLE[indicator]]:
        if side == "high":
            out[level] = round(low, 3)
    return out


def _bands(table: str, override: Optional[dict]) -> list[tuple]:
    bands = RANGES[table]
    if not override:
        return bands
    red, orange, yellow = override.get("red"), override.get("orange"), override.get("yellow")
    mine = []
    for level, low, high in (("red", red, INF), ("orange", orange, red), ("yellow", yellow, orange)):
        if low is not None:
            mine.append((level, low, INF if high is None else high, "high", None))
    return mine + [b for b in bands if b[3] != "high"]


def band_of(table: str, value: float, override: Optional[dict] = None) -> tuple[str, str]:
    """(level, content key) of a value in a table. The tables cover every number."""
    for level, low, high, _side, key in _bands(table, override):
        if low <= value < high:
            return level, key or level
    return "green", "green"


def _finding(indicator: str, label: str, value, unit: str, level: str, section: str, key: str,
             context: Optional[str] = None, **fmt) -> dict:
    content = CONTENT[section][key]
    fmt.setdefault("x", value)
    clean = {k: (f"{v:g}" if isinstance(v, float) else v) for k, v in fmt.items()}
    return {
        "indicator": indicator, "label": label, "value": value, "unit": unit, "level": level,
        "status": LEVEL_TO_STATUS[level], "level_name": LEVEL_NAME[level], "criteria": content["criteria"],
        "action": content["action"], "advice": content["action"], "message": content["message"].format(**clean),
        "procedure": content["procedure"], "context": context,
    }


finding = _finding  # public name for the other modules


def _when(value) -> Optional[datetime]:
    if value is None or isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def minutes_between(later, earlier) -> Optional[float]:
    later, earlier = _when(later), _when(earlier)
    if later is None or earlier is None:
        return None
    try:
        return (later - earlier).total_seconds() / 60
    except TypeError:  # one with a time zone and one without
        return (later.replace(tzinfo=None) - earlier.replace(tzinfo=None)).total_seconds() / 60


def hr_context(state: Optional[str], minutes_in_state: Optional[float]) -> str:
    """Which heart-rate table applies (the document, 'Segmentation by activity_state')."""
    if state == "sleeping":
        return "hr_sleep"
    if state in ("exercising", "eva"):
        return "hr_activity"
    if state == "post_exercise_recovery" and minutes_in_state is not None and minutes_in_state < 30:
        return "hr_activity"  # first 30 min of recovery (PROPOSED: the document only says "after 30 min: at rest")
    return "hr_rest"


def temp_context(state: Optional[str], minutes_in_state: Optional[float]) -> str:
    """Which temperature table applies. Unknown time in recovery counts as at rest (the stricter scale)."""
    if state in ("exercising", "eva"):
        return "temp_activity"
    if state == "post_exercise_recovery" and minutes_in_state is not None and minutes_in_state < 30:
        return "temp_activity"
    return "temp_rest"


# ================================================================= the evaluation of one set of measurements
def evaluate_telemetry(values: dict, *, at=None, meta: Optional[dict] = None, profile: Optional[dict] = None,
                       overrides: Optional[dict] = None) -> list[dict]:
    """The findings (everything that is not Normal) of a set of measurements.

    values    the measurements (a value that is None was not measured: it is not evaluated)
    at        when they were measured (to count the minutes in the current activity and with no signal)
    meta      what the packet said about itself: `state_since`, `signal_quality`, `signal_lost_since`, `sensors`
    profile   the astronaut's record (`baseline_pvt_ms`)
    overrides personal thresholds {indicator: {yellow, orange, red}}
    """
    meta, profile, overrides = meta or {}, profile or {}, overrides or {}
    findings: list[dict] = []
    state = values.get("crew_state")
    minutes_in_state = minutes_between(at, meta.get("state_since")) if meta.get("state_since") else None

    def add(indicator, value, level, section, key, context=None, **fmt):
        if level != "green":
            label, unit = LABEL[indicator]
            findings.append(_finding(indicator, label, value, unit, level, section, key, context, **fmt))

    value = values.get("cabin_co2_mmhg")
    if value is not None:
        level, key = band_of("co2", value, overrides.get("cabin_co2_mmhg"))
        add("cabin_co2_mmhg", value, level, "co2", key)

    value = values.get("heart_rate")
    if value is not None:
        table = hr_context(state, minutes_in_state)
        level, key = band_of(table, value, overrides.get("heart_rate") if table == "hr_rest" else None)
        add("heart_rate", value, level, table, key, table)

    sys_v, dia_v = values.get("blood_pressure_systolic"), values.get("blood_pressure_diastolic")
    for indicator, table, mine in (("blood_pressure_systolic", "bp_sys", sys_v), ("blood_pressure_diastolic", "bp_dia", dia_v)):
        if mine is not None:
            level, key = band_of(table, mine, overrides.get(indicator))
            add(indicator, mine, level, "bp", key, None, x="—" if sys_v is None else sys_v,
                y="—" if dia_v is None else dia_v)

    value = values.get("spo2")
    if value is not None:
        level, key = band_of("spo2", value)
        add("spo2", value, level, "spo2", key)

    value = values.get("respiratory_rate")
    if value is not None:
        level, key = band_of("resp", value, overrides.get("respiratory_rate"))
        add("respiratory_rate", value, level, "resp", key)

    value = values.get("body_temperature")
    if value is not None:
        table = temp_context(state, minutes_in_state)
        level, key = band_of(table, value, overrides.get("body_temperature") if table == "temp_rest" else None)
        section = "temp_rest" if table == "temp_rest" else "temp_activity"
        add("body_temperature", value, level, section, key, table)

    hours = values.get("sleep_hours")
    if hours is not None:
        n6, n4 = values.get("consecutive_nights_under_6h") or 0, values.get("consecutive_nights_under_4h") or 0
        level = "red" if n4 >= 3 else "orange" if n6 >= 2 else "yellow" if hours < 7 else "green"
        add("sleep_hours", hours, level, "sleep", level, None, n=max(n6, 2))

    value = values.get("pvt_b_ms")
    if value is not None:
        baseline = profile.get("baseline_pvt_ms") or DEFAULT_BASELINE_PVT_MS
        level, key = band_of("pvt", value / baseline)
        add("pvt_b_ms", value, level, "pvt", key)

    value = values.get("radiation_rate_msv_day")
    if value is not None:
        level, key = band_of("rad_rate", value, overrides.get("radiation_rate_msv_day"))
        add("radiation_rate_msv_day", value, level, "rad_rate", key)

    dose = values.get("spe_event_dose_msv") or 0
    if dose >= 250 or values.get("spe_active"):
        level = "red" if dose >= 250 else "orange" if dose >= 100 else "yellow"
        add("spe_active", dose, level, "spe", level)

    # Signal quality (section 13). The value of a lost sensor already arrives as None, so it was not evaluated above.
    sensors = meta.get("sensors") or {}
    for group, quality in (meta.get("signal_quality") or {}).items():
        sensor = sensors.get(group) or group
        if quality == "degraded":
            findings.append(_finding(f"signal_{group}", sensor, "degraded", "", "yellow", "signal", "yellow", sensor=sensor))
        elif quality == "lost":
            if group in VITAL_GROUPS:
                lost = minutes_between(at, (meta.get("signal_lost_since") or {}).get(group))
                if lost is not None and lost >= LOST_RED_AFTER_MINUTES:
                    level, key = "red", "red"
                else:
                    level, key = "yellow", "yellow_lost_short"
            else:
                level, key = "orange", "orange"
            findings.append(_finding(f"signal_{group}", sensor, "lost", "", level, "signal", key, sensor=sensor))
    return findings


# ----------------------------------------------------- derived and mission-wide evaluations (used by the dashboard)
def evaluate_dose(percent: float, total_msv: float) -> Optional[dict]:
    level, key = band_of("dose", percent)
    if level == "green":
        return None
    return _finding("radiation_budget", "Career radiation budget used", percent, "%", level, "dose", key,
                    x=round(total_msv, 1), y=round(percent, 1))


def evaluate_link(latency_seconds: Optional[float], link_up: bool) -> dict:
    """The communication link as one more indicator (it does NOT change the colour of the crew status)."""
    if not link_up:
        level, key = "red", "red"
    else:
        level, key = band_of("latency", latency_seconds or 0)
    content = CONTENT["latency"][key]
    return {"link_up": link_up, "latency_seconds": latency_seconds, "level": level, "level_name": LEVEL_NAME[level],
            "criteria": content["criteria"], "action": content["action"],
            "message": content["message"].format(x=f"{latency_seconds:g}" if latency_seconds is not None else "—"),
            "procedure": content["procedure"]}


def phq9_total_band(total: int) -> tuple[str, str]:
    """(level, content key) of a PHQ-9 total alone (the document: 0-4, 5-9, 10-14, 15-19 and 20-27)."""
    if total <= 4:
        return "green", "green"
    if total <= 9:
        return "yellow", "yellow"
    if total <= 14:
        return "orange", "orange"
    return ("red", "red") if total <= 19 else ("red", "red_severe")


def phq9_band(total: int, item9: int) -> tuple[str, str]:
    """(level, content key) of a PHQ-9: question 9 above zero is Critical whatever the total."""
    return ("red", "red_item9") if item9 > 0 else phq9_total_band(total)


def gad7_band(total: int) -> tuple[str, str]:
    level = "green" if total <= 4 else "yellow" if total <= 9 else "orange" if total <= 14 else "red"
    return level, level
