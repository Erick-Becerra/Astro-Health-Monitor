"""Endpoints for the simulator app (App 3): sensor packets, solar events, radiation, mission clock."""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.audit import log_diff, who
from shared.config import SIM_ASTRONAUTS
from shared.database import get_db
from shared.packet import SensorPacket, to_values
from shared.variables import SPE_DOSE_MSV, rng
from shared.vitals import TELEMETRY_FIELDS, Reading, classify

from . import store
from .api_crew import save_capture

router = APIRouter(prefix="/api/sim", tags=["simulator app"])
sim_who = who("simulator-app")

SHORT_NIGHT_HOURS = 6.0
MAX_STEP_SECONDS = 300  # radiation is never added up over a gap longer than this between packets


def consecutive_short_nights(nights: dict, limit: float = SHORT_NIGHT_HOURS) -> int:
    """Nights under `limit` hours in a row, counting back from the latest assessment ({"2026-11-14": 5.2, ...})."""
    days = sorted((date.fromisoformat(k), v) for k, v in nights.items())
    count, previous = 0, None
    for day, hours in reversed(days):
        if hours >= limit or (previous is not None and (previous - day).days != 1):
            break
        count, previous = count + 1, day
    return count


def _save_mood(db: Session, astronaut_id: str, when: datetime, mood: dict, actor: dict) -> dict:
    """Keep the PHQ-9 and the GAD-7 of a packet as manual captures: they count for the colours and for the item 9 alert."""
    out = {}
    for kind in ("phq9", "gad7"):
        try:
            saved = save_capture(db, astronaut_id, kind, {"answers": mood[kind], "assessment_date": mood["date"].isoformat(),
                                                          "source": "packet"}, when,
                                 {"actor": actor["actor"], "app": "simulator-app"})
            out[kind] = {"score": saved["payload"]["score"], "severity": saved["payload"]["severity"],
                         "level": saved["level"], "item9_alert": saved["item9_alert"]}
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            out[kind] = {"skipped": "already saved for that time"}  # the same packet sent twice
    return out


def apply_values(db: Session, astronaut_id: str, timestamp: Optional[datetime], provided: dict, actor: dict,
                 mission: Optional[dict] = None, packet_id: Optional[str] = None, meta: Optional[dict] = None,
                 assessment: Optional[dict] = None, mood: Optional[dict] = None, note: Optional[str] = None) -> dict:
    """Merge what the simulator sent with the last known state, log what changed and store a reading.

    A variable that is absent from `provided` keeps its last value; one that is None is cleared
    (the sensor has no reading). The reading also carries what the rules need to judge it: since when the
    astronaut is in this activity and since when each sensor has no signal.
    """
    now = datetime.now(timezone.utc)
    timestamp = (timestamp or now).replace(microsecond=0)
    at = min(timestamp, now)  # date of the change-log rows (never in the future)
    if mission:
        store.update_mission(db, mission, actor, note=note)
    settings = store.get_mission(db)

    state = store.get_state(db, astronaut_id) or {"vals": {}, "dose_msv": 0.0, "last_spe_at": None,
                                                  "last_spe_dose_msv": None}
    vals = dict(state["vals"])
    logged = vals.pop("_logged", {})
    nights = vals.pop("_nights", {})
    spe_counted = vals.pop("_spe_counted", 0.0)
    last_ts_text = vals.pop("_last_ts", None)
    last_ts = datetime.fromisoformat(last_ts_text) if last_ts_text else None
    signal_state = vals.pop("_signal", {})
    sensors_state = vals.pop("_sensors", {})
    lost_since = vals.pop("_lost_since", {})
    state_since = vals.pop("_state_since", None)
    previous_state = vals.get("crew_state")
    provided = dict(provided)

    # Nights under 6 and under 4 hours in a row: the station works them out from the daily assessments.
    if assessment:
        nights[assessment["date"].isoformat()] = assessment["sleep_hours"]
        for old_day in sorted(nights)[:-30]:
            del nights[old_day]
        provided["consecutive_nights_under_6h"] = consecutive_short_nights(nights, 6.0)
        provided["consecutive_nights_under_4h"] = consecutive_short_nights(nights, 4.0)

    merged = {**vals, **provided}

    # Since when is the astronaut in this activity (the rules judge the first 30 minutes of recovery differently)
    # and since when has each sensor no signal (more than 5 minutes lost on a vital sensor is Critical).
    if merged.get("crew_state") is not None and (merged["crew_state"] != previous_state or not state_since):
        state_since = timestamp.isoformat()
    for group, quality in ((meta or {}).get("signal_quality") or {}).items():
        signal_state[group] = quality
        if quality == "lost":
            lost_since.setdefault(group, timestamp.isoformat())
        else:
            lost_since.pop(group, None)
    sensors_state.update((meta or {}).get("sensors") or {})
    # Every reading holds the whole picture (not only the groups of its own packet).
    full_meta = {**(meta or {}), "signal_quality": dict(signal_state) or None, "sensors": dict(sensors_state) or None,
                 "signal_lost_since": {g: s for g, s in lost_since.items() if signal_state.get(g) == "lost"} or None,
                 "state_since": state_since}
    full_meta = {k: v for k, v in full_meta.items() if v is not None} or None

    # Radiation dose: add up the rate over the time between packets (scaled by time_scale), unless the
    # dose is set directly. A solar event adds only the part of its dose not counted yet.
    dose = state["dose_msv"]
    if provided.get("radiation_dose_msv") is not None:
        dose = provided["radiation_dose_msv"]
    elif last_ts is not None and timestamp > last_ts:
        seconds = min((timestamp - last_ts).total_seconds(), MAX_STEP_SECONDS)
        dose += (merged.get("radiation_rate_msv_day") or 0) * seconds / 86400 * settings["time_scale"]
    if merged.get("spe_active"):
        event = merged.get("spe_event_dose_msv") or 0
        if event > spe_counted:
            dose += event - spe_counted
            spe_counted = event
    else:
        spe_counted = 0.0
    merged["radiation_dose_msv"] = round(dose, 3)
    if merged.get("mission_day") is None:
        merged["mission_day"] = settings["mission_day"]

    spe_at, spe_dose = state["last_spe_at"], state["last_spe_dose_msv"]
    if provided.get("spe_active"):
        spe_at, spe_dose = at, merged.get("spe_event_dose_msv") or spe_dose

    # Change log: compare with the last LOGGED value, so a slow drift still gets recorded.
    # (mission_day is mission-wide: update_mission already logged it.)
    to_log = {k: v for k, v in provided.items() if k != "mission_day"}
    for key, value in to_log.items():
        logged.setdefault(key, value)
    changed = log_diff(db, origin="station", astronaut_id=astronaut_id, old=logged, new=to_log, who=actor,
                       note=note, at=at)
    for key in changed:
        logged[key] = to_log[key]

    reading = Reading(astronaut_id=astronaut_id, timestamp=timestamp, packet_id=packet_id, meta=full_meta,
                      **{k: merged[k] for k in TELEMETRY_FIELDS if merged.get(k) is not None})
    source = (meta or {}).get("source") or "simulator-app"
    db.execute(store.UPSERT_READING, store.reading_params(reading, source))
    newest = max(last_ts, timestamp) if last_ts else timestamp
    store.save_state(db, astronaut_id, {**merged, "_logged": logged, "_nights": nights,
                                        "_spe_counted": spe_counted, "_last_ts": newest.isoformat(),
                                        "_signal": signal_state, "_sensors": sensors_state,
                                        "_lost_since": lost_since, "_state_since": state_since},
                     dose, now, spe_at, spe_dose)
    config = store.get_config(db, astronaut_id)
    result = classify(reading, config["thresholds"], config["profile"])
    db.commit()
    mood_result = _save_mood(db, astronaut_id, timestamp, mood, actor) if mood else None
    return {"stored": True, "astronaut_id": astronaut_id, "timestamp": timestamp, "packet_id": packet_id,
            "level": result["level"], "level_name": result["level_name"], "status": result["status"],
            "findings": result["findings"], "radiation_dose_msv": merged["radiation_dose_msv"], "changed": changed,
            "signal_quality": (full_meta or {}).get("signal_quality"), "mood": mood_result}


@router.post("/packet", status_code=201)
def receive_packet(packet: SensorPacket, db: Session = Depends(get_db), actor: dict = Depends(sim_who)):
    """Sensor packet from the simulator app (schema v1.1). Absent = no change, null = the sensor has no
    reading (clears the value), signal_quality lost = clears the whole group.

    One packet per astronaut per second: two with the same measured_at replace each other.
    The header `X-Actor` (who moved the slider) is recorded in the change log.
    """
    info = to_values(packet)
    source = (info["meta"] or {}).get("source")
    return apply_values(db, info["astronaut_id"], info["timestamp"], info["values"], actor,
                        mission=info["mission"], packet_id=info["packet_id"], meta=info["meta"],
                        assessment=info["assessment"], mood=info["mood"],
                        note=" ".join(x for x in (f"packet {info['packet_id']}" if info["packet_id"] else "",
                                                  source or "") if x) or None)


class SolarEvent(BaseModel):
    astronaut_id: Optional[str] = Field(None, description="Leave empty for the whole crew")
    dose_msv: float = Field(SPE_DOSE_MSV, ge=0, le=5000)


def _crew(db: Session, astronaut_id: Optional[str]) -> list[str]:
    if astronaut_id:
        return [astronaut_id]
    known = {r[0] for r in db.execute(text("SELECT astronaut_id FROM station.sim_state")).all()}
    return sorted(known | set(SIM_ASTRONAUTS))


@router.post("/events/solar", status_code=201)
def start_solar_event(event: SolarEvent, db: Session = Depends(get_db), actor: dict = Depends(sim_who)):
    """Trigger a solar particle event: adds its dose and raises the solar-event alert (250 mSv or more)."""
    out = [apply_values(db, aid, None, {"spe_active": True, "spe_event_dose_msv": event.dose_msv}, actor,
                        note="solar particle event") for aid in _crew(db, event.astronaut_id)]
    return {"started_for": [o["astronaut_id"] for o in out], "dose_msv": event.dose_msv}


@router.delete("/events/solar")
def end_solar_event(astronaut_id: Optional[str] = None, db: Session = Depends(get_db),
                    actor: dict = Depends(sim_who)):
    """End the solar particle event."""
    out = [apply_values(db, aid, None, {"spe_active": False, "spe_event_dose_msv": 0}, actor,
                        note="solar particle event ended") for aid in _crew(db, astronaut_id)]
    return {"ended_for": [o["astronaut_id"] for o in out]}


class Dose(BaseModel):
    mission_dose_msv: float = Field(ge=0, le=5000, description="Dose accumulated on this mission so far")


@router.put("/astronauts/{astronaut_id}/radiation")
def set_dose(astronaut_id: str, body: Dose, db: Session = Depends(get_db), actor: dict = Depends(sim_who)):
    """Set the dose accumulated so far (for example to start a demo on day 78 with 32.76 mSv).
    From there the station keeps adding the radiation rate over time."""
    # Reuse the time of the latest packet: setting a number by hand must not move the astronaut's clock
    # (otherwise the packets that follow would look older and add nothing).
    state = store.get_state(db, astronaut_id)
    last = (state or {}).get("vals", {}).get("_last_ts")
    out = apply_values(db, astronaut_id, datetime.fromisoformat(last) if last else None,
                       {"radiation_dose_msv": body.mission_dose_msv}, actor, note="dose set by hand")
    return {"astronaut_id": astronaut_id, "mission_dose_msv": out["radiation_dose_msv"]}


class Mission(BaseModel):
    mission_day: Optional[int] = Field(None, **rng("mission_day"))
    link_latency_seconds: Optional[float] = Field(None, **rng("link_latency_seconds"))
    time_scale: Optional[float] = Field(None, **rng("time_scale"))
    link_up: Optional[bool] = None
    builtin_simulator: Optional[bool] = None


@router.get("/mission")
def get_mission(db: Session = Depends(get_db)):
    return store.get_mission(db)


@router.put("/mission")
def put_mission(body: Mission, db: Session = Depends(get_db), actor: dict = Depends(sim_who)):
    """Mission day, link latency (2.6 s Moon, up to 2640 s Mars), radiation time scale, link on/off.
    The latency also arrives in every packet (`comm_latency_sec`)."""
    result = store.update_mission(db, body.model_dump(), actor)
    db.commit()
    return result
