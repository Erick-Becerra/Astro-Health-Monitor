"""Database and station helpers of the Earth base that more than one endpoint needs."""
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.clinical import build_dashboard, radiation_budget
from shared.config import LINK_DELAY_SECONDS, STATION_URL
from shared.vitals import READING_FIELDS, TELEMETRY_FIELDS, Reading

READING_SELECT = ("measured_at AS timestamp, received_at, " + ", ".join(READING_FIELDS) + ", status, level")

_COLUMNS = ", ".join(READING_FIELDS)
_BINDS = ", ".join(f"CAST(:{f} AS jsonb)" if f == "meta" else f":{f}" for f in READING_FIELDS)
INSERT_READING = text(f"""
    INSERT INTO earth.readings (astronaut_id, measured_at, {_COLUMNS}, status, level)
    VALUES (:astronaut_id, :timestamp, {_BINDS}, :status, :level)
    ON CONFLICT (astronaut_id, measured_at) DO NOTHING RETURNING id
""")


def reading_params(reading: Reading, result: dict) -> dict:
    data = reading.model_dump()
    data["meta"] = json.dumps(data["meta"]) if data["meta"] is not None else None
    return {**data, "status": result["status"], "level": result["level"]}


def ensure_astronaut(db: Session, astronaut_id: str) -> None:
    db.execute(text("INSERT INTO earth.astronauts (astronaut_id) VALUES (:id) ON CONFLICT DO NOTHING"),
               {"id": astronaut_id})


# ------------------------------------------------------------------ configuration
def get_section(db: Session, astronaut_id: str, section: str) -> tuple[dict, int]:
    """(data, version) of profile, thresholds or exercise_goals. ({}, 0) if never set."""
    row = db.execute(text("SELECT data, version FROM earth.astronaut_config "
                          "WHERE astronaut_id = :id AND section = :s"), {"id": astronaut_id, "s": section}).first()
    return (row[0], row[1]) if row else ({}, 0)


def save_section(db: Session, astronaut_id: str, section: str, data: dict, version: int, by: str) -> None:
    ensure_astronaut(db, astronaut_id)
    db.execute(text("""
        INSERT INTO earth.astronaut_config (astronaut_id, section, data, version, updated_by)
        VALUES (:id, :s, CAST(:data AS jsonb), :v, :by)
        ON CONFLICT (astronaut_id, section) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version,
            updated_by = EXCLUDED.updated_by, updated_at = now()
    """), {"id": astronaut_id, "s": section, "data": json.dumps(data), "v": version, "by": by})


def load_overrides(db: Session, astronaut_id: str) -> dict:
    return get_section(db, astronaut_id, "thresholds")[0]


# -------------------------------------------------------------- station contact
def station_latency() -> float:
    """One-way link latency, as set on the station (falls back to the default if it cannot be reached)."""
    try:
        return float(httpx.get(f"{STATION_URL}/api/sim/mission", timeout=2).json()["link_latency_seconds"])
    except Exception:
        return LINK_DELAY_SECONDS


_LINK_CACHE: dict = {"at": 0.0, "value": None}


def station_link() -> Optional[dict]:
    """Link with the station as {link_up, latency_seconds}. Asked at most every 4 seconds; None if it cannot be reached."""
    if time.monotonic() - _LINK_CACHE["at"] < 4:
        return _LINK_CACHE["value"]
    try:
        status = httpx.get(f"{STATION_URL}/api/status", timeout=1.5).json()
        value = {"link_up": status["link_up"], "latency_seconds": status["link_delay_seconds"]}
    except Exception:
        value = None
    _LINK_CACHE.update(at=time.monotonic(), value=value)
    return value


def queue_for_station(db: Session, astronaut_id: str, kind: str, payload: dict) -> datetime:
    """Put a message or configuration in the outbox, held back for the link latency.
    Returns when it will be delivered. The caller commits."""
    deliver_at = datetime.now(timezone.utc) + timedelta(seconds=station_latency())
    db.execute(text("INSERT INTO earth.outbox (astronaut_id, kind, payload, deliver_at) "
                    "VALUES (:id, :kind, CAST(:payload AS jsonb), :at)"),
               {"id": astronaut_id, "kind": kind, "payload": json.dumps(payload, default=str), "at": deliver_at})
    return deliver_at


def manual_level_sql(astronaut_column: str) -> str:
    """SQL (a scalar subquery) for the worst level among the latest manual captures of an astronaut.
    Blood pressure and glucose count for 24 hours, the questionnaires (PHQ-9, GAD-7) for 14 days."""
    return f"""(SELECT level FROM (
        SELECT DISTINCT ON (kind) kind, level FROM earth.manual_captures m
        WHERE m.astronaut_id = {astronaut_column} AND m.kind IN ('blood_pressure', 'glucose', 'phq9', 'gad7')
          AND m.captured_at >= now() - (CASE WHEN m.kind IN ('phq9', 'gad7') THEN interval '14 days'
                                             ELSE interval '24 hours' END)
        ORDER BY kind, captured_at DESC) latest
      WHERE level IS NOT NULL
      ORDER BY CASE level WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END LIMIT 1)"""


def dashboard_for(db: Session, astronaut_id: str) -> Optional[dict]:
    """The consolidated view of an astronaut as Earth knows it: the SAME calculation the astronaut console
    does (shared/clinical.py), over the data that has reached Earth. So both give the same colour; Earth's
    only lags by the link latency. None if there is no data about the astronaut yet."""
    now = datetime.now(timezone.utc)
    cols = ", ".join(TELEMETRY_FIELDS)
    row = db.execute(text(f"SELECT measured_at, meta, {cols} FROM earth.readings WHERE astronaut_id = :id "
                          "ORDER BY measured_at DESC LIMIT 1"), {"id": astronaut_id}).mappings().first()
    telemetry: dict = {}
    signal: dict = {}
    sensors: dict = {}
    if row:
        telemetry = {f: row[f] for f in TELEMETRY_FIELDS if row[f] is not None}
        telemetry["measured_at"] = row["measured_at"]
        telemetry["meta"] = row["meta"]  # the rules also read the activity start and the sensors without signal
        signal = (row["meta"] or {}).get("signal_quality") or {}
        sensors = (row["meta"] or {}).get("sensors") or {}
    manual = {r["kind"]: {"payload": r["payload"], "captured_at": r["captured_at"]} for r in db.execute(text("""
        SELECT DISTINCT ON (kind) kind, payload, captured_at FROM earth.manual_captures
        WHERE astronaut_id = :id AND kind <> 'countermeasure' ORDER BY kind, captured_at DESC
    """), {"id": astronaut_id}).mappings().all()}
    log = [{"payload": r["payload"], "captured_at": r["captured_at"]} for r in db.execute(text("""
        SELECT payload, captured_at FROM earth.manual_captures
        WHERE astronaut_id = :id AND kind = 'countermeasure' AND captured_at >= :since
        ORDER BY captured_at DESC LIMIT 200
    """), {"id": astronaut_id, "since": now - timedelta(days=7)}).mappings().all()]
    profile = get_section(db, astronaut_id, "profile")[0]
    thresholds = get_section(db, astronaut_id, "thresholds")[0]
    goals = get_section(db, astronaut_id, "exercise_goals")[0]
    if not row and not manual and not log and not profile:
        return None
    dose = db.execute(text("SELECT radiation_dose_msv FROM earth.readings WHERE astronaut_id = :id "
                           "AND radiation_dose_msv IS NOT NULL ORDER BY measured_at DESC LIMIT 1"),
                      {"id": astronaut_id}).scalar() or 0.0
    last_spe = db.execute(text("SELECT max(measured_at) FROM earth.readings WHERE astronaut_id = :id AND spe_active"),
                          {"id": astronaut_id}).scalar()
    return build_dashboard(astronaut_id=astronaut_id, now=now, telemetry=telemetry, manual=manual, profile=profile,
                           thresholds=thresholds, goals=goals, mission_dose=dose, last_spe_at=last_spe,
                           mission_day=telemetry.get("mission_day") or 0, countermeasures=log, signal=signal,
                           sensors=sensors, link=station_link())


# --------------------------------------------------------------------- radiation
def radiation_for(db: Session, astronaut_id: str) -> dict:
    """Radiation budget of an astronaut from the latest dosimetry received plus the pre-flight dose."""
    profile = get_section(db, astronaut_id, "profile")[0]
    latest = db.execute(text("""
        SELECT radiation_dose_msv, radiation_rate_msv_day, spe_active, spe_event_dose_msv
        FROM earth.readings WHERE astronaut_id = :id AND radiation_dose_msv IS NOT NULL
        ORDER BY measured_at DESC LIMIT 1
    """), {"id": astronaut_id}).mappings().first() or {}
    last_spe = db.execute(text("SELECT max(measured_at) FROM earth.readings "
                               "WHERE astronaut_id = :id AND spe_active"), {"id": astronaut_id}).scalar()
    return radiation_budget(profile, latest.get("radiation_dose_msv") or 0.0, latest.get("radiation_rate_msv_day"),
                            bool(latest.get("spe_active")), latest.get("spe_event_dose_msv"), last_spe,
                            datetime.now(timezone.utc))
