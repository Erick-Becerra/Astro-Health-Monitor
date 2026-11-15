"""Saved questionnaires on the station (App 2): the front sends the PHQ-9 or GAD-7 already done, with its score,
severity and recommendation; the station keeps the JSON whole and lets it be read later (it also goes up to Earth)."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.database import get_db
from shared.questionnaires import MAX_BYTES, QuestionnaireIn, as_utc, raw_json, record_view

from .api_crew import save_capture

router = APIRouter(prefix="/api", tags=["space app (astronaut console)"])

COLUMNS = "id, astronaut_id, questionnaire, answered_by, score, severity, answered_at, uplinked_at, content"


@router.post("/crew/{astronaut_id}/questionnaires", status_code=201)
def save_questionnaire(astronaut_id: str, body: QuestionnaireIn, raw: dict = Depends(raw_json),
                       db: Session = Depends(get_db)):
    """Save a PHQ-9 or GAD-7 that the front has already worked out.

    The body is the JSON of the questionnaire (see shared/questionnaires.py): `questionnaire`, `answered_by`,
    `answers`, `score`, `severity`, `recommendation` and, if wanted, `answered_at`; anything else the front adds
    is kept. It is stored whole as long text. The answers also count as a capture of the astronaut, so the
    colours of the dashboard and the PHQ-9 item 9 alert keep working: the answer says `level` and `item9_alert`.
    """
    content = json.dumps(raw, ensure_ascii=False)
    if len(content.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"The questionnaire is larger than {MAX_BYTES} bytes")
    answered_at = as_utc(body.answered_at)
    try:
        new_id = db.execute(text("""
            INSERT INTO station.questionnaire_responses
                (astronaut_id, questionnaire, answered_by, score, severity, answered_at, content)
            VALUES (:id, :q, :by, :score, :severity, :at, :content) RETURNING id
        """), {"id": astronaut_id, "q": body.questionnaire, "by": body.answered_by, "score": body.score,
               "severity": body.severity, "at": answered_at, "content": content}).scalar()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This questionnaire was already saved for that time") from exc
    # It also feeds the dashboard and the item 9 alert (this commits both together).
    capture = save_capture(db, astronaut_id, body.questionnaire, {"answers": body.answers}, answered_at,
                           {"actor": body.answered_by, "app": "space-app"})
    row = db.execute(text(f"SELECT {COLUMNS} FROM station.questionnaire_responses WHERE id = :id"),
                     {"id": new_id}).mappings().one()
    return {**record_view(row), "level": capture["level"], "item9_alert": capture["item9_alert"],
            "findings": capture["findings"]}


@router.get("/crew/{astronaut_id}/questionnaires")
def list_questionnaires(astronaut_id: str, questionnaire: Optional[str] = None, answered_by: Optional[str] = None,
                        since: Optional[datetime] = None, until: Optional[datetime] = None, limit: int = 50,
                        db: Session = Depends(get_db)):
    """The saved questionnaires of an astronaut, newest first. Each one has `response`: the JSON the front sent.
    Filters: questionnaire (`phq9` or `gad7`), answered_by, since, until, limit (up to 500)."""
    rows = db.execute(text(f"""
        SELECT {COLUMNS} FROM station.questionnaire_responses
        WHERE astronaut_id = :id
          AND (CAST(:q AS TEXT) IS NULL OR questionnaire = :q)
          AND (CAST(:by AS TEXT) IS NULL OR answered_by = :by)
          AND (CAST(:since AS timestamptz) IS NULL OR answered_at >= :since)
          AND (CAST(:until AS timestamptz) IS NULL OR answered_at <= :until)
        ORDER BY answered_at DESC LIMIT :limit
    """), {"id": astronaut_id, "q": questionnaire, "by": answered_by, "since": since, "until": until,
           "limit": max(1, min(limit, 500))}).mappings().all()
    return [record_view(r) for r in rows]


@router.get("/crew/{astronaut_id}/questionnaires/{questionnaire_id}")
def get_questionnaire(astronaut_id: str, questionnaire_id: int, db: Session = Depends(get_db)):
    """One saved questionnaire, with the JSON the front sent in `response`."""
    row = db.execute(text(f"SELECT {COLUMNS} FROM station.questionnaire_responses "
                          "WHERE id = :qid AND astronaut_id = :id"),
                     {"qid": questionnaire_id, "id": astronaut_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return record_view(row)
