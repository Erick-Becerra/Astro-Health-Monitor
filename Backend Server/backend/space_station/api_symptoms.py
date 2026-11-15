"""Symptom reports on the station (App 2): the astronaut says something hurts or they feel unwell.

The station keeps the report together with the vitals of that moment. It goes up to Earth, which raises an alert
and keeps the record for the medical team.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.audit import log_change, who
from shared.database import get_db
from shared.symptoms import SEVERITIES, SYMPTOMS, SymptomReportIn
from shared.vitals import TELEMETRY_FIELDS

router = APIRouter(prefix="/api", tags=["space app (astronaut console)"])
crew_who = who("space-app")
COLUMNS = "id, astronaut_id, reported_at, symptom, severity, body_area, description, reported_by, vitals, uplinked_at"


def latest_vitals(db: Session, astronaut_id: str) -> Optional[dict]:
    row = db.execute(text(f"SELECT measured_at, {', '.join(f for f in TELEMETRY_FIELDS)} FROM station.readings "
                          "WHERE astronaut_id = :id ORDER BY measured_at DESC LIMIT 1"), {"id": astronaut_id}).mappings().first()
    if row is None:
        return None
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(row).items() if v is not None}


@router.post("/crew/{astronaut_id}/symptom-report", status_code=201)
def report_symptom(astronaut_id: str, body: SymptomReportIn, db: Session = Depends(get_db),
                   actor: dict = Depends(crew_who)):
    """The astronaut reports a symptom: `symptom` (pain, headache, nausea, dizziness, fatigue, fever,
    breathing_difficulty, chest_pain, vision, mood, injury, other), `severity` (mild, moderate, severe) and, if wanted,
    `body_area`, `description` (long text), `reported_by`, `reported_at`.

    It is stored with the latest vitals at that moment and goes up to Earth, which raises an alert (severe = critical)
    and keeps it in the record of the astronaut. Answers 201 with the stored report."""
    reported_at = (body.reported_at or datetime.now(timezone.utc))
    reported_at = reported_at.replace(tzinfo=reported_at.tzinfo or timezone.utc).replace(microsecond=0)
    by = body.reported_by or actor["actor"]
    vitals = latest_vitals(db, astronaut_id)
    try:
        new_id = db.execute(text("""
            INSERT INTO station.symptom_reports (astronaut_id, reported_at, symptom, severity, body_area, description,
                                                 reported_by, vitals)
            VALUES (:a, :at, :symptom, :severity, :area, :desc, :by, CAST(:vitals AS jsonb)) RETURNING id
        """), {"a": astronaut_id, "at": reported_at, "symptom": body.symptom, "severity": body.severity,
               "area": body.body_area, "desc": body.description, "by": by,
               "vitals": json.dumps(vitals) if vitals else None}).scalar()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This symptom was already reported for that second") from exc
    log_change(db, origin="station", astronaut_id=astronaut_id, variable="symptom_report", old=None,
               new={"symptom": body.symptom, "severity": body.severity}, who={**actor, "actor": by})
    db.commit()
    row = db.execute(text(f"SELECT {COLUMNS} FROM station.symptom_reports WHERE id = :id"), {"id": new_id}).mappings().one()
    return dict(row)


@router.get("/crew/{astronaut_id}/symptom-reports")
def list_symptom_reports(astronaut_id: str, severity: Optional[str] = None, since: Optional[datetime] = None,
                         limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    """The reports of an astronaut, newest first. `uplinked_at` says whether Earth already has it."""
    if severity is not None and severity not in SEVERITIES:
        raise HTTPException(status_code=422, detail=f"severity must be one of {SEVERITIES}")
    rows = db.execute(text(f"""
        SELECT {COLUMNS} FROM station.symptom_reports WHERE astronaut_id = :a
          AND (CAST(:sev AS TEXT) IS NULL OR severity = :sev)
          AND (CAST(:since AS timestamptz) IS NULL OR reported_at >= :since)
        ORDER BY reported_at DESC, id DESC LIMIT :n"""), {"a": astronaut_id, "sev": severity, "since": since, "n": limit}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/symptoms", tags=["variables"])
def symptom_options():
    """The values the report form can offer."""
    return {"symptoms": SYMPTOMS, "severities": SEVERITIES}
