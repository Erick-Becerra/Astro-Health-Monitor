"""What Earth does with data that arrives: store it, classify it, keep the semaphore
history, raise alerts. Used by /api/telemetry, /api/sync and the direct packet endpoint."""
import json
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.clinical import evaluate_manual
from shared.symptoms import SEVERITY_TO_ALERT, alert_texts
from shared.vitals import (LEVEL_ORDER, LEVEL_TO_STATUS, TELEMETRY_FIELDS, Reading, classify, describe,
                           worst_level)

from . import store


class ManualItem(BaseModel):
    astronaut_id: str = Field(min_length=1, max_length=32)
    kind: Literal["blood_pressure", "glucose", "phq9", "gad7", "countermeasure"]
    captured_at: datetime
    actor: Optional[str] = None
    payload: dict


class QuestionnaireItem(BaseModel):
    """A saved questionnaire as the station uploads it: `content` is the JSON the front sent, as text."""

    astronaut_id: str = Field(min_length=1, max_length=32)
    questionnaire: Literal["phq9", "gad7"]
    answered_by: str
    score: int
    severity: str
    answered_at: datetime
    content: str


class SymptomItem(BaseModel):
    """A symptom report as the station uploads it."""

    astronaut_id: str = Field(min_length=1, max_length=32)
    reported_at: datetime
    symptom: str
    severity: Literal["mild", "moderate", "severe"]
    body_area: Optional[str] = None
    description: Optional[str] = None
    reported_by: str
    vitals: Optional[dict] = None


class ChangeItem(BaseModel):
    origin_id: int
    at: datetime
    astronaut_id: Optional[str] = None
    variable: str
    old_value: Any = None
    new_value: Any = None
    actor: Optional[str] = None
    app: Optional[str] = None
    note: Optional[str] = None


class SyncBatch(BaseModel):
    """What the station uploads: readings, manual captures and its change log."""

    readings: list[Reading] = Field(default_factory=list, max_length=1000)
    manual: list[ManualItem] = Field(default_factory=list, max_length=500)
    questionnaires: list[QuestionnaireItem] = Field(default_factory=list, max_length=200)
    changes: list[ChangeItem] = Field(default_factory=list, max_length=1000)
    symptoms: list[SymptomItem] = Field(default_factory=list, max_length=200)


def _create_alert(db: Session, astronaut_id: str, reading_id: Optional[int], severity: str, summary: str,
                  guidance: str, when: Optional[datetime], already_sent: bool) -> None:
    db.execute(text("""
        INSERT INTO earth.alerts (astronaut_id, reading_id, created_at, severity, summary, guidance,
                                  sent_to_station_at)
        VALUES (:astronaut_id, :reading_id, COALESCE(CAST(:when AS timestamptz), now()), :severity, :summary,
                :guidance, CASE WHEN :sent THEN COALESCE(CAST(:when AS timestamptz), now()) END)
    """), {"astronaut_id": astronaut_id, "reading_id": reading_id, "when": when, "severity": severity,
           "summary": summary, "guidance": guidance, "sent": already_sent})


def ingest_readings(db: Session, readings: list[Reading], backfill: bool = False) -> dict:
    """Store readings (re-sending is harmless), keep the semaphore history and raise alerts.

    backfill=True loads OLD data: alerts are dated at the reading time and not sent to the station.
    """
    stored = alerts_created = 0
    overrides: dict = {}
    profiles: dict = {}
    for reading in sorted(readings, key=lambda r: r.timestamp):
        aid = reading.astronaut_id
        store.ensure_astronaut(db, aid)
        if aid not in overrides:
            overrides[aid] = store.load_overrides(db, aid)
            profiles[aid] = store.get_section(db, aid, "profile")[0]
        result = classify(reading, overrides[aid], profiles[aid])

        # What was already wrong in the 10 minutes before this reading, indicator by indicator.
        # An alert is raised for an indicator that is new or got worse. Looking back a while
        # (not just one reading) stops a value that wobbles around a threshold from raising an
        # alert every few seconds, and a second problem is not hidden behind the first one.
        seen: dict = {}
        if result["findings"]:
            prior = db.execute(text(f"""
                SELECT measured_at, meta, {", ".join(TELEMETRY_FIELDS)} FROM earth.readings
                WHERE astronaut_id = :id AND measured_at < :t
                  AND measured_at >= CAST(:t AS timestamptz) - interval '10 minutes'
            """), {"id": aid, "t": reading.timestamp}).mappings().all()
            for row in prior:
                for f in classify(dict(row), overrides[aid], profiles[aid])["findings"]:
                    seen[f["indicator"]] = max(seen.get(f["indicator"], 0), LEVEL_ORDER[f["level"]])

        reading_id = db.execute(store.INSERT_READING, store.reading_params(reading, result)).scalar()
        if reading_id is None:
            continue  # already known
        stored += 1

        # Semaphore history: one row each time the colour changes.
        last_level = db.execute(text("SELECT level FROM earth.level_history WHERE astronaut_id = :id AND at < :t "
                                     "ORDER BY at DESC LIMIT 1"), {"id": aid, "t": reading.timestamp}).scalar()
        if last_level != result["level"]:
            reasons = [{"indicator": f["indicator"], "label": f["label"], "value": f["value"],
                        "unit": f["unit"], "level": f["level"]} for f in result["findings"]]
            db.execute(text("""
                INSERT INTO earth.level_history (astronaut_id, at, level, status, reasons)
                VALUES (:id, :t, :level, :status, CAST(:reasons AS jsonb)) ON CONFLICT DO NOTHING
            """), {"id": aid, "t": reading.timestamp, "level": result["level"], "status": result["status"],
                   "reasons": json.dumps(reasons)})

        # (A sensor that loses its signal is one more finding of the rules: it raises its alert here, and again
        # when it has been lost for more than 5 minutes.)
        new = [f for f in result["findings"] if LEVEL_ORDER[f["level"]] > seen.get(f["indicator"], 0)]
        if new:
            worst = worst_level(f["level"] for f in new)
            summary, guidance = describe(aid, {"level": worst, "findings": new})
            _create_alert(db, aid, reading_id, LEVEL_TO_STATUS[worst], summary, guidance,
                          reading.timestamp if backfill else None, already_sent=backfill)
            alerts_created += 1
    return {"stored": stored, "alerts_created": alerts_created}


def ingest_manual(db: Session, items: list[ManualItem], backfill: bool = False) -> dict:
    """Store manual captures from the crew. An orange or red result (and the PHQ-9 item 9) raises an alert.
    The station already showed the guidance to the crew, so the alert is not sent back to it.
    backfill=True loads OLD data: the alert is dated at the time of the capture."""
    stored = alerts_created = 0
    for item in sorted(items, key=lambda i: i.captured_at):
        store.ensure_astronaut(db, item.astronaut_id)
        evaluated = evaluate_manual(item.kind, item.payload, store.load_overrides(db, item.astronaut_id))
        new_id = db.execute(text("""
            INSERT INTO earth.manual_captures (astronaut_id, kind, captured_at, actor, payload, level)
            VALUES (:id, :kind, :at, :actor, CAST(:payload AS jsonb), :level)
            ON CONFLICT (astronaut_id, kind, captured_at) DO NOTHING RETURNING id
        """), {"id": item.astronaut_id, "kind": item.kind, "at": item.captured_at, "actor": item.actor,
               "payload": json.dumps(evaluated["payload"]), "level": evaluated["level"]}).scalar()
        if new_id is None:
            continue
        stored += 1
        if evaluated["level"] in ("orange", "red") and evaluated["findings"]:
            summary, guidance = describe(item.astronaut_id, {"level": evaluated["level"],
                                                             "findings": evaluated["findings"]})
            _create_alert(db, item.astronaut_id, None, "critical" if evaluated["level"] == "red" else "attention",
                          summary, guidance, item.captured_at if backfill else None, already_sent=True)
            alerts_created += 1
    return {"stored": stored, "alerts_created": alerts_created}


def ingest_questionnaires(db: Session, items: list[QuestionnaireItem]) -> int:
    """Keep the saved questionnaires (re-sending is harmless). The alerts and colours come from the manual
    capture that travels with each one, so nothing else is done here."""
    stored = 0
    for q in sorted(items, key=lambda i: i.answered_at):
        store.ensure_astronaut(db, q.astronaut_id)
        stored += db.execute(text("""
            INSERT INTO earth.questionnaire_responses
                (astronaut_id, questionnaire, answered_by, score, severity, answered_at, content)
            VALUES (:id, :q, :by, :score, :severity, :at, :content)
            ON CONFLICT (astronaut_id, questionnaire, answered_at) DO NOTHING
        """), {"id": q.astronaut_id, "q": q.questionnaire, "by": q.answered_by, "score": q.score,
               "severity": q.severity, "at": q.answered_at, "content": q.content}).rowcount
    return stored


def ingest_symptoms(db: Session, items: list[SymptomItem], backfill: bool = False) -> int:
    """Keep the symptom reports (re-sending is harmless) and raise ONE alert for each new one. The alert is already
    marked as known by the station (the astronaut wrote the report), so it is not sent back to it."""
    stored = 0
    for s in sorted(items, key=lambda i: i.reported_at):
        store.ensure_astronaut(db, s.astronaut_id)
        inserted = db.execute(text("""
            INSERT INTO earth.symptom_reports (astronaut_id, reported_at, symptom, severity, body_area, description,
                                               reported_by, vitals)
            VALUES (:a, :at, :symptom, :severity, :area, :desc, :by, CAST(:vitals AS jsonb))
            ON CONFLICT (astronaut_id, reported_at, symptom) DO NOTHING
        """), {"a": s.astronaut_id, "at": s.reported_at, "symptom": s.symptom, "severity": s.severity,
               "area": s.body_area, "desc": s.description, "by": s.reported_by,
               "vitals": json.dumps(s.vitals, default=str) if s.vitals else None}).rowcount
        if inserted:
            stored += 1
            name = db.execute(text("SELECT name FROM earth.astronauts WHERE astronaut_id = :id"),
                              {"id": s.astronaut_id}).scalar()
            summary, guidance = alert_texts(name, s.astronaut_id, s.model_dump())
            _create_alert(db, s.astronaut_id, None, SEVERITY_TO_ALERT[s.severity], summary, guidance,
                          s.reported_at if backfill else None, True)
    return stored


def ingest_changes(db: Session, items: list[ChangeItem]) -> int:
    stored = 0
    for c in items:
        stored += db.execute(text("""
            INSERT INTO earth.change_log (at, origin, origin_id, astronaut_id, variable, old_value, new_value,
                                          actor, app, note)
            VALUES (:at, 'station', :origin_id, :astronaut_id, :variable, CAST(:old AS jsonb),
                    CAST(:new AS jsonb), :actor, :app, :note)
            ON CONFLICT (origin, origin_id) DO NOTHING
        """), {"at": c.at, "origin_id": c.origin_id, "astronaut_id": c.astronaut_id, "variable": c.variable,
               "old": json.dumps(c.old_value, default=str), "new": json.dumps(c.new_value, default=str),
               "actor": c.actor, "app": c.app, "note": c.note}).rowcount
    return stored
