"""Endpoints for the Earth monitoring app (App 1): record and baseline, clinical rules, notes,
manual captures, context, semaphore history, and the change log.

Everything the app WRITES is logged (who, when, old value, new value) and sent to the
station through the outbox, held back for the link latency."""
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.audit import log_change, log_diff, who
from shared.database import get_db
from shared.questionnaires import record_view
from shared.variables import BY_KEY, rng
from shared.indicators import ADJUSTABLE, LABEL, adjustable_defaults

from . import store

router = APIRouter(prefix="/api", tags=["earth app"])
earth_who = who("earth-app")


# ---------------------------------------------------------------- profile and baseline
class Profile(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    gender: Optional[Literal["female", "male", "other"]] = None
    birth_date: Optional[date] = None
    weight_kg: Optional[float] = Field(None, **rng("weight_kg"))
    agency: Optional[Literal["NASA", "CSA", "ESA", "Roscosmos", "other"]] = Field(
        None, description="Sets the career dose limit: NASA 600 mSv, the others 1000 mSv")
    baseline_hr: Optional[float] = Field(None, **rng("baseline_hr"), description="Pre-flight heart rate (bpm)")
    baseline_pvt_ms: Optional[float] = Field(None, **rng("baseline_pvt_ms"),
                                             description="Pre-flight reaction time (ms): the PVT rules are relative to it")
    baseline_bp_systolic: Optional[float] = Field(None, **rng("baseline_bp_systolic"))
    baseline_bp_diastolic: Optional[float] = Field(None, **rng("baseline_bp_diastolic"))
    dxa_t_score: Optional[float] = Field(None, **rng("dxa_t_score"), description="Bone density (DXA)")
    oct_notes: Optional[str] = Field(None, max_length=1000, description="Eye exam (OCT)")
    prior_radiation_msv: Optional[float] = Field(None, **rng("prior_radiation_msv"))


def _profile_view(db: Session, astronaut_id: str) -> dict:
    row = db.execute(text("SELECT astronaut_id, name, gender, first_seen FROM earth.astronauts "
                          "WHERE astronaut_id = :id"), {"id": astronaut_id}).mappings().one()
    data, version = store.get_section(db, astronaut_id, "profile")
    return {**data, **dict(row), "profile_version": version}


@router.put("/astronauts/{astronaut_id}")
def set_profile(astronaut_id: str, body: Profile, db: Session = Depends(get_db), actor: dict = Depends(earth_who)):
    """Create or update the master record and pre-flight baseline of an astronaut.
    Fields you leave out do not change. Every change is logged and sent to the station."""
    if not 1 <= len(astronaut_id) <= 32:
        raise HTTPException(status_code=422, detail="astronaut_id must be 1 to 32 characters")
    provided = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in body.model_dump(exclude_none=True).items()}
    store.ensure_astronaut(db, astronaut_id)
    old_row = db.execute(text("SELECT name, gender FROM earth.astronauts WHERE astronaut_id = :id"),
                         {"id": astronaut_id}).mappings().one()
    old_data, version = store.get_section(db, astronaut_id, "profile")
    old = {**{k: v for k, v in dict(old_row).items() if v is not None}, **old_data}
    changed = log_diff(db, origin="earth", astronaut_id=astronaut_id, old=old, new=provided, who=actor,
                       include_new=True, note="profile")
    if "name" in provided or "gender" in provided:
        db.execute(text("UPDATE earth.astronauts SET name = COALESCE(:name, name), gender = COALESCE(:gender, gender) "
                        "WHERE astronaut_id = :id"),
                   {"id": astronaut_id, "name": provided.get("name"), "gender": provided.get("gender")})
    delivery = None
    if changed:
        full = {**old, **provided}
        store.save_section(db, astronaut_id, "profile", full, version + 1, actor["actor"])
        delivery = store.queue_for_station(db, astronaut_id, "config", {
            "astronaut_id": astronaut_id, "section": "profile", "data": full, "version": version + 1,
            "updated_by": actor["actor"]})
    db.commit()
    return {**_profile_view(db, astronaut_id), "changed": changed, "station_delivery_at": delivery}


# Tables of Earth that hang from an astronaut, in the order they can be deleted (alerts point to readings).
_EARTH_TABLES = ["alerts", "level_history", "readings", "manual_captures", "questionnaire_responses",
                 "symptom_reports", "astronaut_records", "astronaut_config", "outbox"]
# Station rows Earth has not taken yet: marked as taken so the pull does not bring the astronaut back.
_STATION_PENDING = ["readings", "manual_captures", "questionnaire_responses", "symptom_reports"]


@router.delete("/astronauts/{astronaut_id}")
def delete_astronaut(astronaut_id: str, confirm: bool = False, db: Session = Depends(get_db),
                     actor: dict = Depends(earth_who)):
    """Delete an astronaut from Earth with everything that hangs from it: readings, alerts, level history,
    manual captures, questionnaires, symptom reports, CSV record files, personal thresholds and pending messages.
    It cannot be undone, so it needs `?confirm=true`. The change log keeps one entry saying who deleted it (the
    log itself is never erased). The station keeps its own copy; if it sends new data for the same id the
    astronaut shows up again as a new one. Answers with how many rows were deleted per table."""
    found = db.execute(text("SELECT name FROM earth.astronauts WHERE astronaut_id = :id"), {"id": astronaut_id}).first()
    if found is None:
        raise HTTPException(status_code=404, detail="Astronaut not found")
    if not confirm:
        raise HTTPException(status_code=400, detail="Deleting an astronaut cannot be undone: add ?confirm=true")
    for table in _STATION_PENDING:
        db.execute(text(f"UPDATE station.{table} SET uplinked_at = now() WHERE astronaut_id = :id AND uplinked_at IS NULL"),
                   {"id": astronaut_id})
    deleted = {}
    for table in _EARTH_TABLES:
        deleted[table] = db.execute(text(f"DELETE FROM earth.{table} WHERE astronaut_id = :id"),
                                    {"id": astronaut_id}).rowcount
    db.execute(text("DELETE FROM earth.astronauts WHERE astronaut_id = :id"), {"id": astronaut_id})
    log_change(db, origin="earth", astronaut_id=astronaut_id, variable="astronaut_deleted",
               old={"name": found[0]}, new=None, who=actor, note=f"deleted rows: {sum(deleted.values())}")
    db.commit()
    return {"deleted": astronaut_id, "name": found[0], "rows": deleted}


# ----------------------------------------------------------------------- thresholds
class Threshold(BaseModel):
    yellow: Optional[float] = None
    orange: Optional[float] = None
    red: Optional[float] = None


def _defaults(indicator: str) -> dict:
    label, unit = LABEL[indicator]
    return {"label": label, "unit": unit, "default": adjustable_defaults(indicator)}


@router.get("/astronauts/{astronaut_id}/thresholds")
def get_thresholds(astronaut_id: str, db: Session = Depends(get_db)):
    """Personal thresholds, next to the default ones so the interface can show both.
    A value at or above `yellow` / `orange` / `red` gets that colour."""
    personal, version = store.get_section(db, astronaut_id, "thresholds")
    return {"version": version, "personal": personal,
            "adjustable": {k: _defaults(k) for k in ADJUSTABLE}}


@router.put("/astronauts/{astronaut_id}/thresholds")
def set_thresholds(astronaut_id: str, body: dict[str, Optional[Threshold]], db: Session = Depends(get_db),
                   actor: dict = Depends(earth_who)):
    """Set personal thresholds, e.g. {"body_temperature": {"yellow": 37.3, "orange": 37.8, "red": 38.3}}.
    Send null for an indicator to go back to the default. Indicators you leave out do not change."""
    old, version = store.get_section(db, astronaut_id, "thresholds")
    new = dict(old)
    for indicator, th in body.items():
        if indicator not in ADJUSTABLE:
            raise HTTPException(status_code=422, detail=f"'{indicator}' cannot be adjusted. Use one of: "
                                                        f"{', '.join(ADJUSTABLE)}")
        if th is None:
            new.pop(indicator, None)
            continue
        levels = {k: v for k, v in th.model_dump().items() if v is not None}
        if not levels:
            raise HTTPException(status_code=422, detail=f"{indicator}: give at least one of yellow, orange, red")
        ordered = [levels[k] for k in ("yellow", "orange", "red") if k in levels]
        if ordered != sorted(ordered) or len(set(ordered)) != len(ordered):
            raise HTTPException(status_code=422, detail=f"{indicator}: yellow < orange < red is required")
        meta = BY_KEY.get(indicator)
        if meta and any(not (meta["min"] <= v <= meta["max"]) for v in ordered):
            raise HTTPException(status_code=422, detail=f"{indicator}: values must be between "
                                                        f"{meta['min']} and {meta['max']}")
        new[indicator] = levels
    changed = [k for k in set(old) | set(new) if old.get(k) != new.get(k)]
    for indicator in changed:
        log_change(db, origin="earth", astronaut_id=astronaut_id, variable=f"thresholds.{indicator}",
                   old=old.get(indicator), new=new.get(indicator), who=actor, note="personal threshold")
    delivery = None
    if changed:
        store.save_section(db, astronaut_id, "thresholds", new, version + 1, actor["actor"])
        delivery = store.queue_for_station(db, astronaut_id, "config", {
            "astronaut_id": astronaut_id, "section": "thresholds", "data": new, "version": version + 1,
            "updated_by": actor["actor"]})
    db.commit()
    return {"version": version + (1 if changed else 0), "personal": new, "changed": sorted(changed),
            "station_delivery_at": delivery}


# ------------------------------------------------------------------- exercise goals
class ExerciseGoals(BaseModel):
    ared_sessions_per_week: Optional[int] = Field(None, ge=1, le=14)
    ared_minutes_per_session: Optional[int] = Field(None, ge=5, le=180)
    notes: Optional[str] = Field(None, max_length=500)


@router.get("/astronauts/{astronaut_id}/exercise-goals")
def get_goals(astronaut_id: str, db: Session = Depends(get_db)):
    data, version = store.get_section(db, astronaut_id, "exercise_goals")
    return {"version": version, "goals": data}


@router.put("/astronauts/{astronaut_id}/exercise-goals")
def set_goals(astronaut_id: str, body: ExerciseGoals, db: Session = Depends(get_db),
              actor: dict = Depends(earth_who)):
    """ARED exercise goals. Fields you leave out do not change."""
    old, version = store.get_section(db, astronaut_id, "exercise_goals")
    provided = body.model_dump(exclude_none=True)
    changed = log_diff(db, origin="earth", astronaut_id=astronaut_id, old=old, new=provided, who=actor,
                       include_new=True, note="exercise goals")
    delivery = None
    new = {**old, **provided}
    if changed:
        store.save_section(db, astronaut_id, "exercise_goals", new, version + 1, actor["actor"])
        delivery = store.queue_for_station(db, astronaut_id, "config", {
            "astronaut_id": astronaut_id, "section": "exercise_goals", "data": new, "version": version + 1,
            "updated_by": actor["actor"]})
    db.commit()
    return {"version": version + (1 if changed else 0), "goals": new, "changed": changed,
            "station_delivery_at": delivery}


# -------------------------------------------------------------- notes and messages
class Note(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    kind: Literal["note", "prescription"] = "note"
    severity: Literal["info", "attention", "critical"] = "info"


class Guidance(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    severity: Literal["info", "attention", "critical"] = "info"


def _send(db: Session, astronaut_id: str, kind: str, body: str, severity: str, actor: dict) -> dict:
    store.ensure_astronaut(db, astronaut_id)
    log_change(db, origin="earth", astronaut_id=astronaut_id, variable=kind, old=None,
               new={"body": body, "severity": severity}, who=actor, note="sent to the station")
    delivery = store.queue_for_station(db, astronaut_id, "message", {
        "astronaut_id": astronaut_id, "severity": severity, "kind": "guidance" if kind == "guidance" else kind,
        "body": body})
    db.commit()
    return {"queued": True, "deliver_at": delivery}


@router.post("/astronauts/{astronaut_id}/notes", status_code=201)
def add_note(astronaut_id: str, body: Note, db: Session = Depends(get_db), actor: dict = Depends(earth_who)):
    """Asynchronous medical note or prescription for the crew. It reaches the station after the link latency."""
    return _send(db, astronaut_id, body.kind, body.body, body.severity, actor)


@router.post("/astronauts/{astronaut_id}/messages", status_code=201)
def message_astronaut(astronaut_id: str, body: Guidance, db: Session = Depends(get_db),
                      actor: dict = Depends(earth_who)):
    """A flight surgeon writes to an astronaut. It reaches the station after the link latency."""
    return _send(db, astronaut_id, "guidance", body.body, body.severity, actor)


@router.get("/outbox")
def list_outbox(astronaut_id: Optional[str] = None, pending_only: bool = False, limit: int = 50,
                db: Session = Depends(get_db)):
    """What Earth has sent to the station and whether it has arrived yet."""
    rows = db.execute(text(f"""
        SELECT id, astronaut_id, kind, payload, created_at, deliver_at, delivered_at, attempts, last_error
        FROM earth.outbox WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid)
          {"AND delivered_at IS NULL" if pending_only else ""}
        ORDER BY id DESC LIMIT :limit
    """), {"aid": astronaut_id, "limit": max(1, min(limit, 500))}).mappings().all()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------- reads
@router.get("/astronauts/{astronaut_id}/manual")
def list_manual(astronaut_id: str, kind: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    """Manual captures from the crew, newest first: blood pressure, glucose, PHQ-9, GAD-7, countermeasure log."""
    rows = db.execute(text("""
        SELECT id, kind, captured_at, received_at, actor, payload, level FROM earth.manual_captures
        WHERE astronaut_id = :id AND (CAST(:kind AS TEXT) IS NULL OR kind = :kind)
        ORDER BY captured_at DESC LIMIT :limit
    """), {"id": astronaut_id, "kind": kind, "limit": max(1, min(limit, 500))}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/astronauts/{astronaut_id}/dashboard")
def dashboard(astronaut_id: str, db: Session = Depends(get_db)):
    """The consolidated view of one astronaut: vitals with baseline and signal quality, the 8 systems of the
    anatomical map with their colour, radiation budget, data quality and guides. It is calculated EXACTLY like
    the astronaut console does it, over the data that has reached Earth, so the colours match (Earth's only
    lags by the link latency)."""
    result = store.dashboard_for(db, astronaut_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No data for this astronaut yet")
    return result


Q_COLUMNS = "id, astronaut_id, questionnaire, answered_by, score, severity, answered_at, received_at, content"


def _find_questionnaires(db: Session, astronaut_id: Optional[str], questionnaire: Optional[str],
                         answered_by: Optional[str], since: Optional[datetime], until: Optional[datetime],
                         limit: int) -> list[dict]:
    rows = db.execute(text(f"""
        SELECT {Q_COLUMNS} FROM earth.questionnaire_responses
        WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid)
          AND (CAST(:q AS TEXT) IS NULL OR questionnaire = :q)
          AND (CAST(:by AS TEXT) IS NULL OR answered_by = :by)
          AND (CAST(:since AS timestamptz) IS NULL OR answered_at >= :since)
          AND (CAST(:until AS timestamptz) IS NULL OR answered_at <= :until)
        ORDER BY answered_at DESC LIMIT :limit
    """), {"aid": astronaut_id, "q": questionnaire, "by": answered_by, "since": since, "until": until,
           "limit": max(1, min(limit, 500))}).mappings().all()
    return [record_view(r) for r in rows]


@router.get("/astronauts/{astronaut_id}/questionnaires")
def list_questionnaires(astronaut_id: str, questionnaire: Optional[str] = None, answered_by: Optional[str] = None,
                        since: Optional[datetime] = None, until: Optional[datetime] = None, limit: int = 50,
                        db: Session = Depends(get_db)):
    """The questionnaires (PHQ-9, GAD-7) an astronaut answered, newest first. Each one has `response`: the JSON the
    front sent when it was saved (answers, score, severity, recommendation, who answered...).
    Filters: questionnaire (`phq9` or `gad7`), answered_by, since, until, limit (up to 500)."""
    return _find_questionnaires(db, astronaut_id, questionnaire, answered_by, since, until, limit)


@router.get("/astronauts/{astronaut_id}/questionnaires/{questionnaire_id}")
def get_questionnaire(astronaut_id: str, questionnaire_id: int, db: Session = Depends(get_db)):
    """One saved questionnaire, with the JSON the front sent in `response`."""
    row = db.execute(text(f"SELECT {Q_COLUMNS} FROM earth.questionnaire_responses "
                          "WHERE id = :qid AND astronaut_id = :id"),
                     {"qid": questionnaire_id, "id": astronaut_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return record_view(row)


@router.get("/questionnaires")
def list_all_questionnaires(astronaut_id: Optional[str] = None, questionnaire: Optional[str] = None,
                            answered_by: Optional[str] = None, since: Optional[datetime] = None,
                            until: Optional[datetime] = None, limit: int = 50, db: Session = Depends(get_db)):
    """The saved questionnaires of EVERY astronaut, newest first (same filters, plus astronaut_id)."""
    return _find_questionnaires(db, astronaut_id, questionnaire, answered_by, since, until, limit)


@router.get("/astronauts/{astronaut_id}/level-history")
def level_history(astronaut_id: str, limit: int = 100, db: Session = Depends(get_db)):
    """Every change of semaphore colour (green, yellow, orange, red) with the reasons, newest first."""
    rows = db.execute(text("SELECT at, level, status, reasons FROM earth.level_history WHERE astronaut_id = :id "
                           "ORDER BY at DESC LIMIT :limit"),
                      {"id": astronaut_id, "limit": max(1, min(limit, 1000))}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/astronauts/{astronaut_id}/context")
def context(astronaut_id: str, series: int = 100, db: Session = Depends(get_db)):
    """To audit when and why an alert fired: cabin CO2, semaphore history and the protocol log."""
    co2 = db.execute(text("""
        SELECT measured_at AS timestamp, cabin_co2_mmhg AS value FROM earth.readings
        WHERE astronaut_id = :id AND cabin_co2_mmhg IS NOT NULL ORDER BY measured_at DESC LIMIT :n
    """), {"id": astronaut_id, "n": max(1, min(series, 1000))}).mappings().all()
    co2 = [dict(r) for r in co2][::-1]
    return {
        "cabin_co2": {"latest": co2[-1] if co2 else None, "series": co2,
                      "alert_from_mmhg": 2.3, "limit_mmhg": 3.0},
        "level_history": level_history(astronaut_id, 50, db),
        "protocol_log": list_manual(astronaut_id, "countermeasure", 50, db),
    }


@router.get("/astronauts/{astronaut_id}/radiation")
def radiation(astronaut_id: str, db: Session = Depends(get_db)):
    """Radiation budget: dose received, percent of the career limit and solar-event alert."""
    return store.radiation_for(db, astronaut_id)


@router.get("/changes", tags=["change log"])
def list_changes(astronaut_id: Optional[str] = None, variable: Optional[str] = None,
                 origin: Optional[Literal["earth", "station"]] = None, since: Optional[datetime] = None,
                 limit: int = 100, db: Session = Depends(get_db)):
    """Who changed what, when, from which value to which: Earth's own edits plus the station's
    (simulator variables, crew captures). Newest first."""
    rows = db.execute(text("""
        SELECT id, at, origin, astronaut_id, variable, old_value, new_value, actor, app, note
        FROM earth.change_log
        WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid)
          AND (CAST(:var AS TEXT) IS NULL OR variable = :var OR variable LIKE :var || '.%')
          AND (CAST(:origin AS TEXT) IS NULL OR origin = :origin)
          AND (CAST(:since AS timestamptz) IS NULL OR at >= :since)
        ORDER BY at DESC, id DESC LIMIT :limit
    """), {"aid": astronaut_id, "var": variable, "origin": origin, "since": since,
           "limit": max(1, min(limit, 1000))}).mappings().all()
    return [dict(r) for r in rows]
