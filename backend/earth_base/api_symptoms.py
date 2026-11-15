"""Symptom reports on Earth: the record of what the astronauts reported from the station (an alert is raised for each
one when it arrives). Read only: the reports are written on the station."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.database import get_db
from shared.symptoms import SEVERITIES

router = APIRouter(prefix="/api", tags=["earth app"])
COLUMNS = ("r.id, r.astronaut_id, a.name AS astronaut_name, r.reported_at, r.received_at, r.symptom, r.severity, "
           "r.body_area, r.description, r.reported_by, r.vitals")


def _find(db: Session, astronaut_id: Optional[str], severity: Optional[str], symptom: Optional[str],
          since: Optional[datetime], until: Optional[datetime], limit: int) -> list[dict]:
    if severity is not None and severity not in SEVERITIES:
        raise HTTPException(status_code=422, detail=f"severity must be one of {SEVERITIES}")
    rows = db.execute(text(f"""
        SELECT {COLUMNS} FROM earth.symptom_reports r JOIN earth.astronauts a USING (astronaut_id)
        WHERE (CAST(:a AS TEXT) IS NULL OR r.astronaut_id = :a)
          AND (CAST(:sev AS TEXT) IS NULL OR r.severity = :sev)
          AND (CAST(:sym AS TEXT) IS NULL OR r.symptom = :sym)
          AND (CAST(:since AS timestamptz) IS NULL OR r.reported_at >= :since)
          AND (CAST(:until AS timestamptz) IS NULL OR r.reported_at <= :until)
        ORDER BY r.reported_at DESC, r.id DESC LIMIT :n
    """), {"a": astronaut_id, "sev": severity, "sym": symptom, "since": since, "until": until, "n": limit}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/astronauts/{astronaut_id}/symptom-reports")
def astronaut_symptom_reports(astronaut_id: str, severity: Optional[str] = None, symptom: Optional[str] = None,
                              since: Optional[datetime] = None, until: Optional[datetime] = None,
                              limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    """The symptom reports of an astronaut, newest first (`[]` if none). Each one has the vitals of that moment in
    `vitals`. Filters: severity (mild, moderate, severe), symptom, since, until, limit."""
    found = db.execute(text("SELECT 1 FROM earth.astronauts WHERE astronaut_id = :id"), {"id": astronaut_id}).first()
    if found is None:
        raise HTTPException(status_code=404, detail="Astronaut not found")
    return _find(db, astronaut_id, severity, symptom, since, until, limit)


@router.get("/symptom-reports")
def all_symptom_reports(astronaut_id: Optional[str] = None, severity: Optional[str] = None,
                        symptom: Optional[str] = None, since: Optional[datetime] = None,
                        until: Optional[datetime] = None, limit: int = Query(50, ge=1, le=500),
                        db: Session = Depends(get_db)):
    """Every astronaut's reports, newest first. Same filters, plus astronaut_id."""
    return _find(db, astronaut_id, severity, symptom, since, until, limit)
