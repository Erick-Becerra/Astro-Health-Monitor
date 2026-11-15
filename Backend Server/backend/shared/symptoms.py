"""Symptom reports: what the astronaut sends when something hurts or they feel unwell.

Shared by the station (stores them) and Earth (stores them and raises an alert).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

SYMPTOMS = ["pain", "headache", "nausea", "dizziness", "fatigue", "fever", "breathing_difficulty", "chest_pain",
            "vision", "mood", "injury", "other"]
SEVERITIES = ["mild", "moderate", "severe"]
SEVERITY_NAME = {"mild": "Mild", "moderate": "Moderate", "severe": "Severe"}
# Earth's alert levels are attention / critical: a severe report is critical.
SEVERITY_TO_ALERT = {"mild": "attention", "moderate": "attention", "severe": "critical"}
SYMPTOM_NAME = {
    "pain": "Pain", "headache": "Headache", "nausea": "Nausea", "dizziness": "Dizziness", "fatigue": "Fatigue",
    "fever": "Fever / chills", "breathing_difficulty": "Difficulty breathing", "chest_pain": "Chest pain",
    "vision": "Vision problems", "mood": "Mood / anxiety", "injury": "Injury", "other": "Other symptom",
}
VITAL_KEYS = ["heart_rate", "body_temperature", "blood_pressure_systolic", "blood_pressure_diastolic", "spo2",
              "respiratory_rate", "cabin_co2_mmhg", "crew_state"]


class SymptomReportIn(BaseModel):
    symptom: Literal["pain", "headache", "nausea", "dizziness", "fatigue", "fever", "breathing_difficulty",
                     "chest_pain", "vision", "mood", "injury", "other"] = Field(
        description="What the astronaut feels. Use `other` and write it in `description` if none fits")
    severity: Literal["mild", "moderate", "severe"]
    body_area: Optional[str] = Field(None, max_length=40, description="head, chest, abdomen, back, arm, leg, eyes, general...")
    description: Optional[str] = Field(None, max_length=4000, description="Free text, as long as needed")
    reported_by: Optional[str] = Field(None, max_length=80, description="Defaults to the X-Actor header")
    reported_at: Optional[datetime] = Field(None, description="Defaults to now")


def alert_texts(astronaut_name: Optional[str], aid: str, report: dict) -> tuple[str, str]:
    """(summary, guidance) of the Earth alert for a report."""
    who = astronaut_name or aid
    area = f", {report['body_area']}" if report.get("body_area") else ""
    desc = (report.get("description") or "").strip().replace("\n", " ")
    summary = (f"{who} reports {SYMPTOM_NAME.get(report['symptom'], report['symptom']).lower()} "
               f"({report['severity']}{area})" + (f": {desc[:140]}" + ("..." if len(desc) > 140 else "") if desc else "."))
    vitals = report.get("vitals") or {}
    shown = ", ".join(f"{k.replace('_', ' ')} {vitals[k]}" for k in
                      ("heart_rate", "body_temperature", "spo2", "respiratory_rate") if vitals.get(k) is not None)
    steps = ["Contact the astronaut and ask how they feel now.",
             "Review the vitals at the time of the report" + (f" ({shown})" if shown else "") + " and the trend.",
             "Ask about onset, duration, other symptoms and what they have already done.",
             "Record the case in the medical log and decide whether to treat on board or escalate."]
    if report["severity"] == "severe":
        steps.insert(0, "Severe report: alert the flight surgeon now.")
    return summary, "Procedure: " + " ".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
