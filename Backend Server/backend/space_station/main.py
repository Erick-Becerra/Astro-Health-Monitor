"""Space station service ("on board").

Responsibilities:
  1. Receive what the simulator app (App 3) emits, or a real sensor (the ESP32).
  2. Store everything locally first. Nothing depends on Earth being reachable.
  3. Serve the astronaut console (App 2): manual inputs, dashboard, guidance.
  4. Uplink: send readings, manual captures and the change log to Earth, keeping
     the link latency and retrying after a blackout (store-and-forward).
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.audit import who
from shared.config import (
    CORS_ORIGIN_REGEX, CORS_ORIGINS, EARTH_URL, UPLINK_MODE, SIM_ASTRONAUTS, SIM_INTERVAL_SECONDS, UPLINK_INTERVAL_SECONDS,
)
from shared.database import SessionLocal, get_db
from shared.variables import CATALOG
from shared.vitals import READING_FIELDS, Reading

from . import store
from .api_crew import router as crew_router
from .api_questionnaires import router as questionnaires_router
from .api_symptoms import router as symptoms_router
from .api_sim import router as sim_router
from .simulator import SCENARIOS, Simulator

log = logging.getLogger("station")

simulator = Simulator(SIM_ASTRONAUTS)
uplink = {"last_uplink": None, "last_error": None}


# ------------------------------------------------------ background work
def builtin_step() -> None:
    """One tick of the built-in demo simulator (off when the mission setting says so, and it leaves
    alone any astronaut the simulator app is driving)."""
    readings = simulator.tick(time.monotonic())
    with SessionLocal() as db:
        if not store.get_mission(db)["builtin_simulator"]:
            return
        skip = store.externally_driven(db)
    readings = [r for r in readings if r.astronaut_id not in skip]
    if readings:
        store.store_readings(readings, "simulator")


async def simulate_loop():
    while True:
        try:
            await asyncio.to_thread(builtin_step)
        except Exception:
            log.exception("simulator step failed")
        await asyncio.sleep(SIM_INTERVAL_SECONDS)


def read_mission() -> dict:
    with SessionLocal() as db:
        return store.get_mission(db)


async def uplink_loop():
    if UPLINK_MODE == "db":  # Earth reads the station tables itself (earth_base/pull.py): nothing to send
        return
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            await asyncio.sleep(UPLINK_INTERVAL_SECONDS)
            try:
                mission = await asyncio.to_thread(read_mission)
                if not mission["link_up"]:
                    continue
                batch = await asyncio.to_thread(store.pending_uplink, mission["link_latency_seconds"])
                if not any(batch.values()):
                    continue
                payload = jsonable_encoder({
                    "readings": [{k: v for k, v in r.items() if k != "id"} for r in batch["readings"]],
                    "manual": [{k: v for k, v in r.items() if k != "id"} for r in batch["manual"]],
                    "questionnaires": [{k: v for k, v in r.items() if k != "id"} for r in batch["questionnaires"]],
                    "symptoms": [{k: v for k, v in r.items() if k != "id"} for r in batch["symptoms"]],
                    "changes": batch["changes"],
                })
                response = await client.post(f"{EARTH_URL}/api/sync", json=payload)
                response.raise_for_status()
                await asyncio.to_thread(store.mark_uplinked, batch)
                uplink["last_uplink"] = datetime.now(timezone.utc)
                uplink["last_error"] = None
            except Exception as exc:  # Earth down or unreachable: keep the data, try again later.
                uplink["last_error"] = f"{type(exc).__name__}: {exc}"
                log.warning("uplink failed, will retry: %s", uplink["last_error"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.ensure_mission()
    tasks = [asyncio.create_task(simulate_loop()), asyncio.create_task(uplink_loop())]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    title="Space Station API",
    description="Simulator input (App 3), astronaut console (App 2), local storage and uplink to Earth.",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_origin_regex=CORS_ORIGIN_REGEX,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(sim_router)
app.include_router(crew_router)
app.include_router(questionnaires_router)
app.include_router(symptoms_router)


# ------------------------------------------------------------ endpoints
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "space-station"}


@app.get("/api/health/db")
def health_db(db: Session = Depends(get_db)):
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


@app.get("/api/status")
def status(db: Session = Depends(get_db)):
    """Link state and how much data is waiting to be sent to Earth."""
    mission = store.get_mission(db)
    waiting = {t: db.execute(text(f"SELECT count(*) FROM station.{t} WHERE uplinked_at IS NULL "
                                  + ("AND origin = 'station'" if t == "change_log" else ""))).scalar()
               for t in ("readings", "manual_captures", "questionnaire_responses", "change_log")}
    return {
        "link_up": mission["link_up"],
        "link_delay_seconds": mission["link_latency_seconds"],
        "mission_day": mission["mission_day"],
        "readings_waiting_for_uplink": waiting["readings"],
        "waiting_for_uplink": waiting,
        "uplink_mode": UPLINK_MODE,
        "last_uplink": (db.execute(text("SELECT max(uplinked_at) FROM station.readings")).scalar()
                        if UPLINK_MODE == "db" else uplink["last_uplink"]),
        "last_error": None if UPLINK_MODE == "db" else uplink["last_error"],
        "crew": sorted(set(simulator.values) | {r[0] for r in db.execute(
            text("SELECT astronaut_id FROM station.sim_state")).all()}),
        "scenarios_running": simulator.running(time.monotonic()),
    }


class LinkState(BaseModel):
    up: bool


@app.post("/api/link")
def set_link(state: LinkState, db: Session = Depends(get_db), actor: dict = Depends(who("simulator-app"))):
    """Simulate a communication blackout (up=false) or restore the link (up=true)."""
    store.update_mission(db, {"link_up": state.up}, actor)
    db.commit()
    return {"link_up": state.up}


@app.post("/api/readings", status_code=201)
def add_reading(reading: Reading):
    """Entry point for a real sensor (the ESP32). Same format as docs/data-format.md."""
    store.store_readings([reading], "sensor")
    return {"stored": True}


@app.get("/api/readings")
def list_readings(limit: int = 50, astronaut_id: Optional[str] = None, db: Session = Depends(get_db)):
    """The most recent readings stored on board."""
    rows = db.execute(text(f"""
        SELECT astronaut_id, measured_at AS timestamp, {", ".join(READING_FIELDS)}, source, uplinked_at
        FROM station.readings WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid)
        ORDER BY measured_at DESC LIMIT :limit
    """), {"aid": astronaut_id, "limit": max(1, min(limit, 500))}).mappings().all()
    return [dict(r) for r in rows]


class Scenario(BaseModel):
    astronaut_id: str
    scenario: Literal[tuple(SCENARIOS)]  # type: ignore[valid-type]
    seconds: float = Field(default=60, gt=0, le=3600)


@app.post("/api/scenarios", status_code=201)
def start_scenario(body: Scenario):
    """Demo helper for the built-in simulator: make an astronaut's vitals drift (fever, tachycardia, ...)."""
    if body.astronaut_id not in simulator.values:
        raise HTTPException(status_code=404, detail=f"Unknown astronaut {body.astronaut_id}")
    simulator.start_scenario(body.astronaut_id, body.scenario, body.seconds, time.monotonic())
    return {"running": simulator.running(time.monotonic())}


@app.delete("/api/scenarios")
def clear_scenarios(astronaut_id: Optional[str] = None):
    simulator.clear_scenario(astronaut_id)
    return {"running": simulator.running(time.monotonic())}


class Message(BaseModel):
    astronaut_id: Optional[str] = None
    severity: Literal["info", "attention", "critical"] = "info"
    kind: Literal["guidance", "note", "prescription"] = "guidance"
    body: str = Field(min_length=1, max_length=2000)


@app.post("/api/messages", status_code=201)
def receive_message(message: Message, db: Session = Depends(get_db)):
    """Guidance, medical note or prescription from Earth. Refused while the link is down, so Earth retries."""
    if not store.get_mission(db)["link_up"]:
        raise HTTPException(status_code=503, detail="Link with Earth is down")
    new_id = db.execute(text("""
        INSERT INTO station.messages (astronaut_id, severity, kind, body)
        VALUES (:astronaut_id, :severity, :kind, :body) RETURNING id
    """), message.model_dump()).scalar()
    db.commit()
    return {"id": new_id}


@app.get("/api/messages")
def list_messages(unread_only: bool = False, astronaut_id: Optional[str] = None,
                  db: Session = Depends(get_db)):
    rows = db.execute(text(f"""
        SELECT id, received_at, astronaut_id, severity, kind, body, acknowledged
        FROM station.messages
        WHERE (CAST(:aid AS TEXT) IS NULL OR astronaut_id = :aid OR astronaut_id IS NULL)
          {"AND NOT acknowledged" if unread_only else ""}
        ORDER BY id DESC LIMIT 100
    """), {"aid": astronaut_id}).mappings().all()
    return [dict(r) for r in rows]


@app.post("/api/messages/{message_id}/ack")
def acknowledge_message(message_id: int, db: Session = Depends(get_db)):
    updated = db.execute(text("UPDATE station.messages SET acknowledged = TRUE WHERE id = :id"),
                         {"id": message_id}).rowcount
    db.commit()
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"acknowledged": True}
