"""Earth takes the station's data straight from the database.

The station stores every reading (with its level), manual capture, questionnaire and change in its own
tables. This loop reads what Earth has not taken yet (uplinked_at IS NULL) and runs it through the SAME
ingest functions as POST /api/sync, so alerts, levels and the change log behave exactly the same. Nothing
travels over HTTP and the station does not have to be running for Earth to read what it already stored.

The link switch of the mission still counts: with link_up = false Earth stops taking data.
"""
import asyncio
import logging
from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from shared.config import PULL_INTERVAL_SECONDS
from shared.database import SessionLocal
from shared.vitals import READING_FIELDS

from .ingest import SyncBatch, ingest_changes, ingest_manual, ingest_questionnaires, ingest_readings, ingest_symptoms

log = logging.getLogger("earth.pull")
state = {"last_pull": None, "last_error": None, "taken": 0}
_COLS = ", ".join(READING_FIELDS)


def pull_once() -> int:
    """Take one batch from the station tables. Returns how many rows were taken."""
    with SessionLocal() as db:
        if not db.execute(text("SELECT link_up FROM station.mission_settings WHERE id = 1")).scalar():
            return 0
        readings = db.execute(text(f"""
            SELECT id, astronaut_id, measured_at AS timestamp, {_COLS} FROM station.readings
            WHERE uplinked_at IS NULL ORDER BY measured_at LIMIT 500""")).mappings().all()
        manual = db.execute(text("""
            SELECT id, astronaut_id, kind, captured_at, actor, payload FROM station.manual_captures
            WHERE uplinked_at IS NULL ORDER BY captured_at LIMIT 200""")).mappings().all()
        questionnaires = db.execute(text("""
            SELECT id, astronaut_id, questionnaire, answered_by, score, severity, answered_at, content
            FROM station.questionnaire_responses WHERE uplinked_at IS NULL ORDER BY answered_at LIMIT 200""")).mappings().all()
        changes = db.execute(text("""
            SELECT id AS origin_id, at, astronaut_id, variable, old_value, new_value, actor, app, note
            FROM station.change_log WHERE origin = 'station' AND uplinked_at IS NULL ORDER BY id LIMIT 500""")).mappings().all()
        symptoms = db.execute(text("""
            SELECT id, astronaut_id, reported_at, symptom, severity, body_area, description, reported_by, vitals
            FROM station.symptom_reports WHERE uplinked_at IS NULL ORDER BY reported_at LIMIT 200""")).mappings().all()
        if not (readings or manual or questionnaires or changes or symptoms):
            return 0
        drop_id = lambda rows: [{k: v for k, v in dict(r).items() if k != "id"} for r in rows]
        batch = SyncBatch.model_validate(jsonable_encoder({
            "readings": drop_id(readings), "manual": drop_id(manual),
            "questionnaires": drop_id(questionnaires), "symptoms": drop_id(symptoms),
            "changes": [dict(r) for r in changes]}))
        ingest_readings(db, batch.readings)
        ingest_manual(db, batch.manual)
        ingest_questionnaires(db, batch.questionnaires)
        ingest_symptoms(db, batch.symptoms)
        ingest_changes(db, batch.changes)
        for table, key, rows in (("readings", "id", readings), ("manual_captures", "id", manual),
                                 ("questionnaire_responses", "id", questionnaires), ("symptom_reports", "id", symptoms),
                                 ("change_log", "origin_id", changes)):
            ids = [r[key] for r in rows]
            if ids:
                db.execute(text(f"UPDATE station.{table} SET uplinked_at = now() "
                                "WHERE id = ANY(:ids)"), {"ids": ids})
        db.commit()
        return len(readings) + len(manual) + len(questionnaires) + len(symptoms) + len(changes)


async def pull_loop():
    while True:
        await asyncio.sleep(PULL_INTERVAL_SECONDS)
        try:
            n = await asyncio.to_thread(pull_once)
            if n:
                state["taken"] += n
                state["last_pull"] = datetime.now(timezone.utc)
            state["last_error"] = None
        except Exception as exc:  # keep going: the data stays in the station tables
            state["last_error"] = f"{type(exc).__name__}: {exc}"
            log.warning("pull failed, will retry: %s", state["last_error"])
