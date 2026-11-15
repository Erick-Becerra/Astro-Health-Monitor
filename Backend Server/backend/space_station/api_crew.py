"""Endpoints for the astronaut console (App 2): manual inputs, consolidated dashboard,
configuration received from Earth, and the change log of the station."""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.audit import log_change, who
from shared.clinical import ITEM9_ADVICE, build_dashboard, evaluate_manual
from shared.database import get_db
from shared.variables import COUNTERMEASURES, GLUCOSE_CONTEXTS, rng
from shared.vitals import TELEMETRY_FIELDS

from . import store

router = APIRouter(prefix="/api", tags=["space app (astronaut console)"])
crew_who = who("space-app")


# ----------------------------------------------------------------- manual inputs
class BloodPressure(BaseModel):
    systolic: float = Field(**rng("blood_pressure_systolic"), description="mmHg")
    diastolic: float = Field(**rng("blood_pressure_diastolic"), description="mmHg")
    captured_at: Optional[datetime] = None


class Glucose(BaseModel):
    value: float = Field(**rng("glucose_mg_dl"), description="mg/dL")
    context: Literal["fasting", "postprandial"]
    captured_at: Optional[datetime] = None


def _check_answers(value: list[int]) -> list[int]:
    if any(not 0 <= a <= 3 for a in value):
        raise ValueError("every answer must be between 0 and 3")
    return value


class PHQ9(BaseModel):
    answers: list[int] = Field(min_length=9, max_length=9, description="9 answers, each 0 to 3")
    captured_at: Optional[datetime] = None
    _range = field_validator("answers")(_check_answers)


class GAD7(BaseModel):
    answers: list[int] = Field(min_length=7, max_length=7, description="7 answers, each 0 to 3")
    captured_at: Optional[datetime] = None
    _range = field_validator("answers")(_check_answers)


class CountermeasureLog(BaseModel):
    type: Literal[tuple(COUNTERMEASURES)]  # type: ignore[valid-type]
    note: Optional[str] = Field(None, max_length=500)
    captured_at: Optional[datetime] = None


def save_capture(db: Session, astronaut_id: str, kind: str, payload: dict, captured_at: Optional[datetime],
                 actor: dict) -> dict:
    """Evaluate a manual capture, store it, log it, and raise the item 9 alert when needed."""
    now = datetime.now(timezone.utc)
    captured_at = captured_at or now
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=timezone.utc)
    config = store.get_config(db, astronaut_id)
    evaluated = evaluate_manual(kind, payload, config["thresholds"])
    previous = db.execute(text("SELECT payload FROM station.manual_captures WHERE astronaut_id = :id AND kind = :k "
                               "ORDER BY captured_at DESC LIMIT 1"), {"id": astronaut_id, "k": kind}).scalar()
    try:
        capture_id = db.execute(text("""
            INSERT INTO station.manual_captures (astronaut_id, kind, captured_at, actor, payload)
            VALUES (:id, :kind, :at, :actor, CAST(:payload AS jsonb)) RETURNING id
        """), {"id": astronaut_id, "kind": kind, "at": captured_at, "actor": actor["actor"],
               "payload": json.dumps(evaluated["payload"], default=str)}).scalar()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A capture with this time already exists") from exc
    log_change(db, origin="station", astronaut_id=astronaut_id, variable=kind, old=previous,
               new=evaluated["payload"], who=actor, note="manual capture", at=min(captured_at, now))
    item9 = bool(evaluated["payload"].get("item9_alert"))
    if item9:
        db.execute(text("INSERT INTO station.messages (astronaut_id, severity, kind, body) "
                        "VALUES (:id, 'critical', 'guidance', :body)"), {"id": astronaut_id, "body": ITEM9_ADVICE})
    db.commit()
    return {"id": capture_id, "kind": kind, "captured_at": captured_at, "level": evaluated["level"],
            "payload": evaluated["payload"], "findings": evaluated["findings"], "item9_alert": item9}


@router.post("/crew/{astronaut_id}/blood-pressure", status_code=201)
def add_blood_pressure(astronaut_id: str, body: BloodPressure, db: Session = Depends(get_db),
                       actor: dict = Depends(crew_who)):
    """Systolic and diastolic pressure from the oscillometric cuff or finger module."""
    return save_capture(db, astronaut_id, "blood_pressure",
                        {"systolic": body.systolic, "diastolic": body.diastolic}, body.captured_at, actor)


@router.post("/crew/{astronaut_id}/glucose", status_code=201)
def add_glucose(astronaut_id: str, body: Glucose, db: Session = Depends(get_db),
                actor: dict = Depends(crew_who)):
    """Capillary glucose in mg/dL, with the context (fasting or postprandial)."""
    return save_capture(db, astronaut_id, "glucose", {"value": body.value, "context": body.context},
                        body.captured_at, actor)


@router.post("/crew/{astronaut_id}/phq9", status_code=201)
def add_phq9(astronaut_id: str, body: PHQ9, db: Session = Depends(get_db), actor: dict = Depends(crew_who)):
    """The 9 PHQ-9 answers (0 to 3). Item 9 above zero raises an alert on the spot."""
    return save_capture(db, astronaut_id, "phq9", {"answers": body.answers}, body.captured_at, actor)


@router.post("/crew/{astronaut_id}/gad7", status_code=201)
def add_gad7(astronaut_id: str, body: GAD7, db: Session = Depends(get_db), actor: dict = Depends(crew_who)):
    """The 7 GAD-7 answers (0 to 3)."""
    return save_capture(db, astronaut_id, "gad7", {"answers": body.answers}, body.captured_at, actor)


@router.post("/crew/{astronaut_id}/log", status_code=201)
def add_log(astronaut_id: str, body: CountermeasureLog, db: Session = Depends(get_db),
            actor: dict = Depends(crew_who)):
    """Countermeasure taken or symptom reported (15 g carbohydrates, ARED session, shelter, headache, blurred vision...)."""
    return save_capture(db, astronaut_id, "countermeasure", {"type": body.type, "note": body.note},
                        body.captured_at, actor)


@router.get("/crew/{astronaut_id}/manual")
def list_manual(astronaut_id: str, kind: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    """Manual captures, newest first. kind: blood_pressure, glucose, phq9, gad7, countermeasure."""
    rows = db.execute(text("""
        SELECT id, kind, captured_at, actor, payload, uplinked_at FROM station.manual_captures
        WHERE astronaut_id = :id AND (CAST(:kind AS TEXT) IS NULL OR kind = :kind)
        ORDER BY captured_at DESC LIMIT :limit
    """), {"id": astronaut_id, "kind": kind, "limit": max(1, min(limit, 500))}).mappings().all()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------- dashboard
@router.get("/crew/{astronaut_id}/dashboard")
def dashboard(astronaut_id: str, db: Session = Depends(get_db)):
    """Everything the console shows in one call: unified vitals (telemetry + latest manual captures +
    pre-flight baseline), anatomical map by system, radiation budget, solar-event alert and the
    immediate-action guides. Works with no connection to Earth."""
    now = datetime.now(timezone.utc)
    cols = ", ".join(TELEMETRY_FIELDS)
    # The newest reading is the current state: the station stores the full merged state in every reading,
    # and a variable that is empty there has no reading now (do not look back for an older value).
    rows = db.execute(text(f"SELECT measured_at, meta, {cols} FROM station.readings WHERE astronaut_id = :id "
                           "ORDER BY measured_at DESC LIMIT 1"), {"id": astronaut_id}).mappings().all()
    telemetry: dict = {}
    signal: dict = {}
    sensors: dict = {}
    if rows:
        telemetry = {f: rows[0][f] for f in TELEMETRY_FIELDS if rows[0][f] is not None}
        telemetry["measured_at"] = rows[0]["measured_at"]
        telemetry["meta"] = rows[0]["meta"]  # the rules also read the activity start and the sensors without signal
        signal = (rows[0]["meta"] or {}).get("signal_quality") or {}
        sensors = (rows[0]["meta"] or {}).get("sensors") or {}

    manual = {r["kind"]: {"payload": r["payload"], "captured_at": r["captured_at"]} for r in db.execute(text("""
        SELECT DISTINCT ON (kind) kind, payload, captured_at FROM station.manual_captures
        WHERE astronaut_id = :id AND kind <> 'countermeasure' ORDER BY kind, captured_at DESC
    """), {"id": astronaut_id}).mappings().all()}
    log = [{"payload": r["payload"], "captured_at": r["captured_at"]} for r in db.execute(text("""
        SELECT payload, captured_at FROM station.manual_captures
        WHERE astronaut_id = :id AND kind = 'countermeasure' AND captured_at >= :since
        ORDER BY captured_at DESC LIMIT 200
    """), {"id": astronaut_id, "since": now - timedelta(days=7)}).mappings().all()]

    config = store.get_config(db, astronaut_id)
    state = store.get_state(db, astronaut_id) or {}
    mission = store.get_mission(db)
    if not rows and not manual and not any(config.values()):
        raise HTTPException(status_code=404, detail="No data for this astronaut yet")
    return build_dashboard(
        astronaut_id=astronaut_id, now=now, telemetry=telemetry, manual=manual,
        profile=config["profile"], thresholds=config["thresholds"], goals=config["exercise_goals"],
        mission_dose=state.get("dose_msv") or 0.0, last_spe_at=state.get("last_spe_at"),
        mission_day=telemetry.get("mission_day", mission["mission_day"]), countermeasures=log,
        signal=signal, sensors=sensors,
        link={"link_up": mission["link_up"], "latency_seconds": mission["link_latency_seconds"]})


@router.get("/crew/{astronaut_id}/config")
def crew_config(astronaut_id: str, db: Session = Depends(get_db)):
    """Profile, baseline, personal thresholds and exercise goals the station has received from Earth."""
    rows = db.execute(text("SELECT section, data, version, updated_by, updated_at FROM station.astronaut_config "
                           "WHERE astronaut_id = :id"), {"id": astronaut_id}).mappings().all()
    return {r["section"]: {"data": r["data"], "version": r["version"], "updated_by": r["updated_by"],
                           "updated_at": r["updated_at"]} for r in rows}


# -------------------------------------------------------------- from Earth (inbox)
class ConfigUpdate(BaseModel):
    astronaut_id: str = Field(min_length=1, max_length=32)
    section: Literal["profile", "thresholds", "exercise_goals"]
    data: dict
    version: int = Field(1, ge=1)
    updated_by: Optional[str] = None


@router.post("/inbox/config", tags=["from Earth"])
def receive_config(body: ConfigUpdate, db: Session = Depends(get_db)):
    """Profile, thresholds or goals sent from Earth. Refused while the link is down, so Earth retries."""
    if not store.get_mission(db)["link_up"]:
        raise HTTPException(status_code=503, detail="Link with Earth is down")
    existing = db.execute(text("SELECT data, version FROM station.astronaut_config "
                               "WHERE astronaut_id = :id AND section = :s"),
                          {"id": body.astronaut_id, "s": body.section}).mappings().first()
    if existing and existing["version"] > body.version:
        return {"applied": False, "reason": "older version"}
    db.execute(text("""
        INSERT INTO station.astronaut_config (astronaut_id, section, data, version, updated_by)
        VALUES (:id, :s, CAST(:data AS jsonb), :v, :by)
        ON CONFLICT (astronaut_id, section) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version,
            updated_by = EXCLUDED.updated_by, updated_at = now()
    """), {"id": body.astronaut_id, "s": body.section, "data": json.dumps(body.data), "v": body.version,
           "by": body.updated_by})
    if not existing or existing["data"] != body.data:
        log_change(db, origin="earth", astronaut_id=body.astronaut_id, variable=body.section,
                   old=existing["data"] if existing else None, new=body.data,
                   who={"actor": body.updated_by or "earth-app", "app": "earth-app"},
                   note=f"received on the station, version {body.version}")
    db.commit()
    return {"applied": True, "version": body.version}


# ---------------------------------------------------------------------- change log
@router.get("/changes", tags=["change log"])
def list_changes(astronaut_id: Optional[str] = None, variable: Optional[str] = None,
                 since: Optional[datetime] = None, limit: int = 100, db: Session = Depends(get_db)):
    """Who changed what, when, from which value to which. Newest first."""
    rows = db.execute(text("""
        SELECT id, at, origin, astronaut_id, variable, old_value, new_value, actor, app, note
        FROM station.change_log
        WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid)
          AND (CAST(:var AS TEXT) IS NULL OR variable = :var)
          AND (CAST(:since AS timestamptz) IS NULL OR at >= :since)
        ORDER BY id DESC LIMIT :limit
    """), {"aid": astronaut_id, "var": variable, "since": since, "limit": max(1, min(limit, 1000))}).mappings().all()
    return [dict(r) for r in rows]
