"""Database access of the station that more than one endpoint needs."""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.audit import log_diff
from shared.config import LINK_DELAY_SECONDS
from shared.database import SessionLocal
from shared.vitals import READING_FIELDS, Reading

_COLUMNS = ", ".join(READING_FIELDS)
_BINDS = ", ".join(f"CAST(:{f} AS jsonb)" if f == "meta" else f":{f}" for f in READING_FIELDS)
_INSERT = f"""
    INSERT INTO station.readings (astronaut_id, measured_at, {_COLUMNS}, source)
    VALUES (:astronaut_id, :timestamp, {_BINDS}, :source)
"""
INSERT_READING = text(_INSERT + " ON CONFLICT (astronaut_id, measured_at) DO NOTHING")
# Packets from the simulator app: if two arrive for the same second, the latest wins.
UPSERT_READING = text(_INSERT + f""" ON CONFLICT (astronaut_id, measured_at) DO UPDATE SET
    {", ".join(f"{f} = EXCLUDED.{f}" for f in READING_FIELDS)}, source = EXCLUDED.source, uplinked_at = NULL""")

MISSION_FIELDS = ["mission_day", "link_latency_seconds", "time_scale", "link_up", "builtin_simulator"]
CONFIG_SECTIONS = ["profile", "thresholds", "exercise_goals"]


def reading_params(reading: Reading, source: str) -> dict:
    data = reading.model_dump()
    data["meta"] = json.dumps(data["meta"]) if data["meta"] is not None else None
    data["source"] = source
    return data


def store_readings(readings: list[Reading], source: str, upsert: bool = False) -> None:
    with SessionLocal() as db:
        db.execute(UPSERT_READING if upsert else INSERT_READING, [reading_params(r, source) for r in readings])
        db.commit()


# ----------------------------------------------------------------------- mission
def ensure_mission() -> None:
    """Create the mission row on first start. LINK_DELAY_SECONDS only sets the starting latency."""
    with SessionLocal() as db:
        db.execute(text("INSERT INTO station.mission_settings (id, link_latency_seconds) VALUES (1, :lat) "
                        "ON CONFLICT DO NOTHING"), {"lat": LINK_DELAY_SECONDS})
        db.commit()


def get_mission(db: Session) -> dict:
    row = db.execute(text("SELECT mission_day, link_latency_seconds, time_scale, link_up, builtin_simulator, "
                          "updated_at FROM station.mission_settings WHERE id = 1")).mappings().one()
    return dict(row)


def update_mission(db: Session, changes: dict, who: dict, note: Optional[str] = None) -> dict:
    """Change mission settings and write each real change to the change log. The caller commits."""
    changes = {k: v for k, v in changes.items() if k in MISSION_FIELDS and v is not None}
    old = get_mission(db)
    if changes:
        sets = ", ".join(f"{k} = :{k}" for k in changes)
        db.execute(text(f"UPDATE station.mission_settings SET {sets}, updated_at = now() WHERE id = 1"), changes)
        log_diff(db, origin="station", astronaut_id=None, old=old, new=changes, who=who, note=note)
    return {**old, **changes}


# --------------------------------------------------------------------- sim state
def get_state(db: Session, astronaut_id: str) -> Optional[dict]:
    row = db.execute(text("SELECT vals, dose_msv, last_frame_at, last_spe_at, last_spe_dose_msv "
                          "FROM station.sim_state WHERE astronaut_id = :id"), {"id": astronaut_id}).mappings().first()
    return dict(row) if row else None


def save_state(db: Session, astronaut_id: str, vals: dict, dose: float, frame_at: datetime,
               spe_at: Optional[datetime], spe_dose: Optional[float]) -> None:
    db.execute(text("""
        INSERT INTO station.sim_state (astronaut_id, vals, dose_msv, last_frame_at, last_spe_at, last_spe_dose_msv)
        VALUES (:id, CAST(:vals AS jsonb), :dose, :frame_at, :spe_at, :spe_dose)
        ON CONFLICT (astronaut_id) DO UPDATE SET vals = EXCLUDED.vals, dose_msv = EXCLUDED.dose_msv,
            last_frame_at = EXCLUDED.last_frame_at, last_spe_at = EXCLUDED.last_spe_at,
            last_spe_dose_msv = EXCLUDED.last_spe_dose_msv
    """), {"id": astronaut_id, "vals": json.dumps(vals, default=str), "dose": dose, "frame_at": frame_at,
           "spe_at": spe_at, "spe_dose": spe_dose})


def externally_driven(db: Session, seconds: int = 30) -> set[str]:
    """Astronauts the simulator app has sent data for recently: the built-in demo simulator leaves them alone."""
    rows = db.execute(text("SELECT astronaut_id FROM station.sim_state "
                           "WHERE last_frame_at > now() - make_interval(secs => :s)"), {"s": seconds}).all()
    return {r[0] for r in rows}


# ------------------------------------------------------------------------ config
def get_config(db: Session, astronaut_id: str) -> dict:
    """Profile, personal thresholds and exercise goals received from Earth (empty dicts if none yet)."""
    rows = db.execute(text("SELECT section, data FROM station.astronaut_config WHERE astronaut_id = :id"),
                      {"id": astronaut_id}).all()
    config = {s: {} for s in CONFIG_SECTIONS}
    config.update({r[0]: r[1] for r in rows})
    return config


# ------------------------------------------------------------------------ uplink
def pending_uplink(latency_seconds: float) -> dict:
    """Everything Earth has not confirmed yet that is old enough to have 'travelled' the link latency."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=latency_seconds)
    cols = ", ".join(f for f in READING_FIELDS)
    with SessionLocal() as db:
        readings = db.execute(text(f"""
            SELECT id, astronaut_id, measured_at AS timestamp, {cols} FROM station.readings
            WHERE uplinked_at IS NULL AND measured_at <= :cutoff ORDER BY measured_at LIMIT 500
        """), {"cutoff": cutoff}).mappings().all()
        manual = db.execute(text("""
            SELECT id, astronaut_id, kind, captured_at, actor, payload FROM station.manual_captures
            WHERE uplinked_at IS NULL AND captured_at <= :cutoff ORDER BY captured_at LIMIT 200
        """), {"cutoff": cutoff}).mappings().all()
        questionnaires = db.execute(text("""
            SELECT id, astronaut_id, questionnaire, answered_by, score, severity, answered_at, content
            FROM station.questionnaire_responses WHERE uplinked_at IS NULL AND answered_at <= :cutoff
            ORDER BY answered_at LIMIT 200
        """), {"cutoff": cutoff}).mappings().all()
        symptoms = db.execute(text("""
            SELECT id, astronaut_id, reported_at, symptom, severity, body_area, description, reported_by, vitals
            FROM station.symptom_reports WHERE uplinked_at IS NULL AND reported_at <= :cutoff
            ORDER BY reported_at LIMIT 200"""), {"cutoff": cutoff}).mappings().all()
        changes = db.execute(text("""
            SELECT id AS origin_id, at, astronaut_id, variable, old_value, new_value, actor, app, note
            FROM station.change_log WHERE origin = 'station' AND uplinked_at IS NULL AND at <= :cutoff
            ORDER BY id LIMIT 500
        """), {"cutoff": cutoff}).mappings().all()
    return {"readings": [dict(r) for r in readings], "manual": [dict(r) for r in manual],
            "questionnaires": [dict(r) for r in questionnaires], "symptoms": [dict(r) for r in symptoms],
            "changes": [dict(r) for r in changes]}


def mark_uplinked(sent: dict) -> None:
    with SessionLocal() as db:
        for table, key, rows in (("readings", "id", sent["readings"]), ("manual_captures", "id", sent["manual"]),
                                 ("questionnaire_responses", "id", sent["questionnaires"]), ("symptom_reports", "id", sent["symptoms"]),
                                 ("change_log", "origin_id", sent["changes"])):
            ids = [r[key] for r in rows]
            if ids:
                db.execute(text(f"UPDATE station.{table} SET uplinked_at = now() WHERE id = ANY(:ids)"),
                           {"ids": ids})
        db.commit()
