"""Earth base service ("mission control").

Responsibilities:
  1. Receive what the station uploads (POST /api/sync), safely even when the same data arrives twice.
  2. Analyse it (shared/vitals.py), keep the semaphore history and raise alerts.
  3. Let the Earth app (App 1) edit the record and the clinical rules, log every change and send it
     to the station after the link latency (outbox).
  4. Serve the frontend.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.config import CORS_ORIGIN_REGEX, CORS_ORIGINS, STATION_URL, UPLINK_MODE
from shared.indicators import evaluate_link
from shared.database import SessionLocal, get_db
from shared.packet import SensorPacket, to_values
from shared.variables import CATALOG
from shared.vitals import LEVEL_TO_STATUS, Reading, TelemetryBatch, classify, worst_level

from . import pull, store
from .api_clinical import router as clinical_router
from .api_records import router as records_router
from .api_symptoms import router as symptoms_router
from .ingest import (ManualItem, SyncBatch, ingest_changes, ingest_manual, ingest_questionnaires, ingest_readings,
                     ingest_symptoms)

log = logging.getLogger("earth")

RESEND_INTERVAL_SECONDS = 5
OUTBOX_INTERVAL_SECONDS = 2


# ----------------------------------------------------- station messaging
async def resend_alerts_loop():
    """Alerts whose message did not reach the station yet are sent again."""
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            await asyncio.sleep(RESEND_INTERVAL_SECONDS)
            try:
                with SessionLocal() as db:
                    unsent = db.execute(text("""
                        SELECT id, astronaut_id, severity, summary, guidance
                        FROM earth.alerts WHERE sent_to_station_at IS NULL ORDER BY id LIMIT 50
                    """)).mappings().all()
                    for alert in unsent:
                        response = await client.post(f"{STATION_URL}/api/messages", json={
                            "astronaut_id": alert["astronaut_id"], "severity": alert["severity"],
                            "body": f"{alert['summary']}. {alert['guidance']}"})
                        response.raise_for_status()
                        db.execute(text("UPDATE earth.alerts SET sent_to_station_at = now() WHERE id = :id"),
                                   {"id": alert["id"]})
                        db.commit()
            except Exception as exc:  # station unreachable or link down: try again on the next round
                log.warning("could not deliver alerts yet: %s", exc)


async def outbox_loop():
    """Messages and configuration for the station, delivered once their link latency has passed.
    While the link is down the station refuses them and they are retried."""
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            await asyncio.sleep(OUTBOX_INTERVAL_SECONDS)
            try:
                with SessionLocal() as db:
                    due = db.execute(text("""
                        SELECT id, kind, payload FROM earth.outbox
                        WHERE delivered_at IS NULL AND deliver_at <= now() ORDER BY id LIMIT 20
                    """)).mappings().all()
                    for item in due:
                        path = "/api/inbox/config" if item["kind"] == "config" else "/api/messages"
                        try:
                            response = await client.post(f"{STATION_URL}{path}", json=item["payload"])
                            response.raise_for_status()
                            db.execute(text("UPDATE earth.outbox SET delivered_at = now(), attempts = attempts + 1, "
                                            "last_error = NULL WHERE id = :id"), {"id": item["id"]})
                        except Exception as exc:
                            db.execute(text("UPDATE earth.outbox SET attempts = attempts + 1, last_error = :e "
                                            "WHERE id = :id"), {"id": item["id"], "e": str(exc)[:300]})
                        db.commit()
            except Exception as exc:
                log.warning("outbox round failed: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = [asyncio.create_task(resend_alerts_loop()), asyncio.create_task(outbox_loop())]
    if UPLINK_MODE == "db":
        tasks.append(asyncio.create_task(pull.pull_loop()))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    title="Astro Health Monitor - Earth base API",
    description="Receives data from the station, analyses it, lets the Earth app edit rules and serves the frontend.",
    version="0.3.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_origin_regex=CORS_ORIGIN_REGEX,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(clinical_router)
app.include_router(records_router)
app.include_router(symptoms_router)


# --------------------------------------------------------------- health
@app.get("/api/health")
def health():
    """The API is running."""
    return {"status": "ok", "service": "earth-base"}


@app.get("/api/health/db")
def health_db(db: Session = Depends(get_db)):
    """The API can reach the database."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not reachable") from exc
    return {"status": "ok"}


@app.get("/api/variables", tags=["variables"])
def variables(group: Optional[str] = None):
    """Every variable: unit, range, who writes it and in which app it is edited.
    Build the editable controls from this. group: telemetry, environment, mission, manual, profile, rules."""
    return [v for v in CATALOG if group is None or v["group"] == group]


# ------------------------------------------------------------ telemetry
@app.post("/api/telemetry")
def receive_telemetry(batch: TelemetryBatch, backfill: bool = False, db: Session = Depends(get_db)):
    """Readings only. Re-sending the same reading is harmless.

    backfill=true loads OLD data (demo history): alerts are dated at the reading
    time and are not sent to the station.
    """
    result = ingest_readings(db, batch.readings, backfill)
    db.commit()
    return {"received": len(batch.readings), **result}


@app.post("/api/sync")
def receive_sync(batch: SyncBatch, backfill: bool = False, db: Session = Depends(get_db)):
    """What the station uploads: readings, manual captures and its change log. Re-sending is harmless.

    backfill=true loads OLD data (demo history): alerts are dated at the time of the reading or
    capture and are not sent to the station."""
    readings = ingest_readings(db, batch.readings, backfill)
    manual = ingest_manual(db, batch.manual, backfill)
    questionnaires = ingest_questionnaires(db, batch.questionnaires)
    symptoms = ingest_symptoms(db, batch.symptoms, backfill)
    changes = ingest_changes(db, batch.changes)
    db.commit()
    return {"readings": readings, "manual": manual, "questionnaires_stored": questionnaires,
            "symptoms_stored": symptoms, "changes_stored": changes}


@app.post("/api/telemetry/packet", status_code=201, tags=["simulator app"])
def receive_packet(packet: SensorPacket, db: Session = Depends(get_db)):
    """The simulator app can also send its sensor packet straight to Earth (same format as on the
    station: header, mission_context, biometrics, radiation_dosimetry). The station copy of the same
    packet is ignored when it arrives later. Prefer sending to the station."""
    info = to_values(packet)
    stamp = (info["timestamp"] or datetime.now(timezone.utc)).replace(microsecond=0)
    reading = Reading(astronaut_id=info["astronaut_id"], timestamp=stamp, packet_id=info["packet_id"],
                      meta=info["meta"], **info["values"])
    result = ingest_readings(db, [reading])
    verdict = classify(reading, store.load_overrides(db, reading.astronaut_id),
                       store.get_section(db, reading.astronaut_id, "profile")[0])
    mood = None
    if info["mood"]:  # PHQ-9 and GAD-7 of the packet: kept as manual captures (colours and item 9 alert)
        items = [ManualItem(astronaut_id=reading.astronaut_id, kind=kind, captured_at=stamp, actor="simulator-app",
                            payload={"answers": info["mood"][kind], "assessment_date": info["mood"]["date"].isoformat(),
                                     "source": "packet"}) for kind in ("phq9", "gad7")]
        mood = ingest_manual(db, items)
    db.commit()
    return {**result, "astronaut_id": reading.astronaut_id, "timestamp": stamp, "level": verdict["level"],
            "level_name": verdict["level_name"], "status": verdict["status"], "findings": verdict["findings"],
            "mood": mood}


# ----------------------------------------------------------- astronauts
def with_findings(row: dict, overrides: dict, profile: dict) -> dict:
    """Add the per-indicator findings (what is wrong and what to do) to a reading row."""
    return {**row, "findings": classify(row, overrides, profile)["findings"]}


@app.get("/api/astronauts")
def list_astronauts(db: Session = Depends(get_db)):
    """Every registered astronaut with their latest reading, status and semaphore level."""
    rows = db.execute(text(f"""
        SELECT a.astronaut_id, a.name, a.gender, a.first_seen,
               (SELECT row_to_json(r) FROM (
                   SELECT {store.READING_SELECT} FROM earth.readings
                   WHERE astronaut_id = a.astronaut_id ORDER BY measured_at DESC LIMIT 1) r) AS latest,
               {store.manual_level_sql("a.astronaut_id")} AS manual_level
        FROM earth.astronauts a ORDER BY a.astronaut_id
    """)).mappings().all()
    out = []
    for r in rows:
        level = (r["latest"] or {}).get("level")
        full = store.dashboard_for(db, r["astronaut_id"])  # same calculation as the astronaut console
        overall = full["level"] if full else None
        out.append({**r, "status": (r["latest"] or {}).get("status", "unknown"), "level": level,
                    "overall_level": overall, "overall_status": LEVEL_TO_STATUS.get(overall, "unknown")})
    return out


@app.get("/api/astronauts/{astronaut_id}")
def get_astronaut(astronaut_id: str, db: Session = Depends(get_db)):
    """One astronaut: latest reading, what is wrong and what to do, profile, personal rules and radiation budget."""
    astronaut = db.execute(text("SELECT astronaut_id, name, gender, first_seen FROM earth.astronauts "
                                "WHERE astronaut_id = :id"), {"id": astronaut_id}).mappings().first()
    if astronaut is None:
        raise HTTPException(status_code=404, detail="Astronaut not found")
    latest = db.execute(text(f"SELECT {store.READING_SELECT} FROM earth.readings WHERE astronaut_id = :id "
                             "ORDER BY measured_at DESC LIMIT 1"), {"id": astronaut_id}).mappings().first()
    overrides = store.load_overrides(db, astronaut_id)
    profile, _ = store.get_section(db, astronaut_id, "profile")
    goals, _ = store.get_section(db, astronaut_id, "exercise_goals")
    manual_level = db.execute(text(f"SELECT {store.manual_level_sql(':id')}"), {"id": astronaut_id}).scalar()
    full = store.dashboard_for(db, astronaut_id)  # same calculation as the astronaut console
    overall = full["level"] if full else worst_level([(latest or {}).get("level"), manual_level])
    return {**astronaut, "level": (latest or {}).get("level"), "manual_level": manual_level,
            "overall_level": overall, "overall_status": LEVEL_TO_STATUS[overall],
            "latest": with_findings(dict(latest), overrides, profile) if latest else None,
            "profile": profile, "thresholds": overrides, "exercise_goals": goals,
            "radiation": store.radiation_for(db, astronaut_id)}


# numeric variables that are averaged when the history is grouped
_AVERAGED = [("heart_rate", 1), ("hrv_ms", 1), ("body_temperature", 2), ("blood_pressure_systolic", 0),
             ("blood_pressure_diastolic", 0), ("sleep_hours", 1), ("pvt_b_ms", 0), ("spo2", 1),
             ("respiratory_rate", 1), ("radiation_rate_msv_day", 2), ("cabin_co2_mmhg", 2)]


@app.get("/api/astronauts/{astronaut_id}/readings")
def astronaut_readings(astronaut_id: str, limit: int = 100, since: Optional[datetime] = None,
                       until: Optional[datetime] = None, bucket_seconds: Optional[int] = None,
                       db: Session = Depends(get_db)):
    """History for charts, oldest first.

    since / until: ISO 8601 time range (optional).
    bucket_seconds: average the readings into buckets of this size (for long
    ranges, e.g. 300 = one point every 5 minutes). Each bucket keeps the WORST
    status and level seen inside it.
    limit: the newest `limit` rows of the range are returned (max 5000).
    """
    params = {"id": astronaut_id, "since": since, "until": until, "limit": max(1, min(limit, 5000))}
    where = """astronaut_id = :id
        AND (CAST(:since AS timestamptz) IS NULL OR measured_at >= :since)
        AND (CAST(:until AS timestamptz) IS NULL OR measured_at <= :until)"""
    if bucket_seconds:
        params["bucket"] = max(1, min(bucket_seconds, 86400))
        averages = ",\n".join(f"round(avg({f})::numeric, {n})::float AS {f}" for f, n in _AVERAGED)
        inner = f"""
            SELECT date_bin(make_interval(secs => CAST(:bucket AS double precision)),
                            measured_at, TIMESTAMPTZ '2000-01-01') AS timestamp,
                   max(received_at) AS received_at, {averages},
                   max(radiation_dose_msv) AS radiation_dose_msv,
                   (array_agg(status ORDER BY CASE status WHEN 'critical' THEN 0
                                                          WHEN 'attention' THEN 1 ELSE 2 END))[1] AS status,
                   (array_agg(level ORDER BY CASE level WHEN 'red' THEN 0 WHEN 'orange' THEN 1
                                                        WHEN 'yellow' THEN 2 ELSE 3 END))[1] AS level
            FROM earth.readings WHERE {where} GROUP BY 1 ORDER BY 1 DESC LIMIT :limit"""
    else:
        inner = f"""SELECT {store.READING_SELECT} FROM earth.readings WHERE {where}
                    ORDER BY measured_at DESC LIMIT :limit"""
    rows = db.execute(text(f"SELECT * FROM ({inner}) newest ORDER BY timestamp"), params).mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/alerts")
def list_alerts(astronaut_id: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT al.id, al.astronaut_id, a.name, a.gender, al.created_at, al.severity, al.summary,
               al.guidance, al.sent_to_station_at
        FROM earth.alerts al JOIN earth.astronauts a ON a.astronaut_id = al.astronaut_id
        WHERE (CAST(:id AS TEXT) IS NULL OR al.astronaut_id = :id)
        ORDER BY al.id DESC LIMIT :limit
    """), {"id": astronaut_id, "limit": max(1, min(limit, 500))}).mappings().all()
    return [dict(r) for r in rows]


# ------------------------------------------------------- station contact
@app.get("/api/station")
async def station_status():
    """Link state of the station, as seen from Earth, with the communication level (the rules of the indicators
    document: up to 3 s Normal, up to 14 s Caution, more Moderate risk, no link Critical)."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{STATION_URL}/api/status")
            response.raise_for_status()
            status = response.json()
            return {**status, "communication": evaluate_link(status.get("link_delay_seconds"),
                                                             bool(status.get("link_up", True)))}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Station is not reachable") from exc
