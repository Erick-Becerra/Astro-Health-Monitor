"""Demo data for the three apps, created through the real endpoints.

Three astronauts (AST-01 to AST-03, the id format of the simulator) with six hours of
sensor packets in the v1.1 format, the manual captures of the crew, and the record and
rules written from Earth. Each one tells a different story so every screen has something to show:

  AST-01  Lucía Fernández (NASA)   cabin CO2 climbs to orange, exercise session, a headache report
  AST-02  Tomás Herrera (ESA)      solar particle event (250 mSv), spacewalk, a fever judged by PERSONAL thresholds
  AST-03  Sofía Navarro (CSA)      3 short nights in a row, heart sensor LOST, temperature sensor DEGRADED,
                                   low glucose, high blood pressure, PHQ-9 item 9 alert, SANS symptoms

Run it once, from the project folder (it runs inside the station container):
    docker compose exec -T space-station python seed_apps_demo.py

Running it again does nothing (it recognises its own packets). To start over, run
database/demo/reset_apps_demo.sql first (see docs/apps-contract.md, "Demo data").
"""
import random
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi.encoders import jsonable_encoder

from shared.config import EARTH_URL
from space_station import store

STATION = "http://localhost:8001"
HISTORY_MINUTES = 360
DOCTOR = {"X-Actor": "Dr. Rivera (demo)"}
SIM = {"X-Actor": "seed_apps_demo"}
CREW = {"X-Actor": "crew (demo)"}

# ------------------------------------------------------------------ the crew
CREW_DATA = {
    "AST-01": {
        "profile": {"name": "Lucía Fernández", "gender": "female", "birth_date": "1986-04-22", "weight_kg": 61.0,
                    "agency": "NASA", "baseline_hr": 58, "baseline_bp_systolic": 112, "baseline_bp_diastolic": 70,
                    "dxa_t_score": -0.3, "oct_notes": "Normal retinal thickness (demo data)",
                    "prior_radiation_msv": 85},
        "goals": {"ared_sessions_per_week": 5, "ared_minutes_per_session": 45},
        "base": {"hr": 58, "sys": 112, "dia": 70, "temp": 36.6, "spo2": 98.5, "rr": 14},
        "sleep": [7.1, 7.4, 7.0], "pvt": 262, "dose": 32.76,
    },
    "AST-02": {
        "profile": {"name": "Tomás Herrera", "gender": "male", "birth_date": "1983-09-03", "weight_kg": 82.5,
                    "agency": "ESA", "baseline_hr": 62, "baseline_bp_systolic": 118, "baseline_bp_diastolic": 74,
                    "dxa_t_score": -0.8, "oct_notes": "Mild optic disc swelling, to be followed (demo data)",
                    "prior_radiation_msv": 120},
        "thresholds": {"body_temperature": {"yellow": 37.3, "orange": 37.8, "red": 38.3}},
        "goals": {"ared_sessions_per_week": 5, "ared_minutes_per_session": 45},
        "base": {"hr": 62, "sys": 118, "dia": 74, "temp": 36.7, "spo2": 98.0, "rr": 14},
        "sleep": [6.4, 6.8, 6.4], "pvt": 290, "dose": 32.76,
    },
    "AST-03": {
        "profile": {"name": "Sofía Navarro", "gender": "female", "birth_date": "1990-12-15", "weight_kg": 57.0,
                    "agency": "CSA", "baseline_hr": 60, "baseline_bp_systolic": 110, "baseline_bp_diastolic": 70,
                    "dxa_t_score": -1.4, "oct_notes": "Normal (demo data)", "prior_radiation_msv": 40},
        "goals": {"ared_sessions_per_week": 3, "ared_minutes_per_session": 40,
                  "notes": "Reduced load while sleep recovers"},
        "base": {"hr": 60, "sys": 110, "dia": 70, "temp": 36.8, "spo2": 97.5, "rr": 15},
        "sleep": [5.4, 5.6, 5.1], "pvt": 410, "dose": 41.2,
    },
}
NOTES = {
    "AST-03": [("prescription", "Light exposure for 15 minutes after waking and no screens in the last hour before sleep."),
               ("note", "Sleep has been under 6 h for three nights. We will review the schedule at the next call.")],
    "AST-02": [("note", "Optic disc follow-up: report any change in vision straight away.")],
}

# Offsets of each variable by crew state (the simulated body follows these).
HR = {"sleeping": -8, "resting": 0, "working": 8, "exercising": 75, "post_exercise_recovery": 28, "eva": 38}
TEMP = {"sleeping": -0.3, "resting": 0, "working": 0.1, "exercising": 0.9, "post_exercise_recovery": 0.45, "eva": 0.4}
RR = {"sleeping": -2, "resting": 0, "working": 1, "exercising": 14, "post_exercise_recovery": 6, "eva": 8}
SYS = {"sleeping": -8, "resting": 0, "working": 4, "exercising": 38, "post_exercise_recovery": 14, "eva": 10}
DIA = {"sleeping": -6, "resting": 0, "working": 2, "exercising": 8, "post_exercise_recovery": 4, "eva": 3}


def crew_state(aid: str, m: int) -> str:
    if m < 40:
        return "sleeping"
    if aid == "AST-02" and 260 <= m < 310:
        return "eva"
    if aid == "AST-02" and 310 <= m < 340:
        return "post_exercise_recovery"
    if 150 <= m < 195:
        return "exercising"
    if 195 <= m < 225:
        return "post_exercise_recovery"
    if 60 <= m < 150:
        return "working"
    return "resting"


def triangle(m: int, start: int, end: int) -> float:
    """0 outside [start, end], rising to 1 in the middle."""
    if not start <= m <= end:
        return 0.0
    half = (end - start) / 2
    return 1 - abs(m - start - half) / half


class Body:
    """Smooth physiology of one astronaut: each value drifts toward its target for the crew state."""

    def __init__(self, aid: str, rng: random.Random):
        self.aid, self.rng, self.b = aid, rng, CREW_DATA[aid]["base"]
        self.v = {"hr": self.b["hr"], "temp": self.b["temp"], "rr": self.b["rr"], "sys": self.b["sys"],
                  "dia": self.b["dia"], "co2": 2.0}

    def step(self, m: int) -> dict:
        s, aid, b = crew_state(aid := self.aid, m), self.aid, self.b
        target = {
            "hr": b["hr"] + HR[s], "temp": b["temp"] + TEMP[s], "rr": b["rr"] + RR[s],
            "sys": b["sys"] + SYS[s] + (22 if aid == "AST-03" and m >= 20 else 0), "dia": b["dia"] + DIA[s],
            "co2": 2.0 + (0.9 * triangle(m, 100, 300) if aid == "AST-01" else 0.0),
        }
        if aid == "AST-02" and m >= 320:
            target["temp"] += 1.4  # a fever, to be judged by his personal thresholds
        if aid == "AST-03" and 300 <= m < 330:
            target["hr"] += 60  # a stress episode at rest
        noise = {"hr": 1.6, "temp": 0.03, "rr": 0.5, "sys": 1.8, "dia": 1.2, "co2": 0.02}
        for k in self.v:
            self.v[k] += 0.3 * (target[k] - self.v[k]) + self.rng.gauss(0, noise[k])
        spo2 = min(100.0, self.b["spo2"] + self.rng.gauss(0, 0.35) - (0.8 if s == "exercising" else 0))
        return {**self.v, "spo2": spo2, "state": s}


def build_packet(aid: str, m: int, when: datetime, vals: dict, rng: random.Random) -> dict:
    cardio = {"heart_rate_bpm": round(vals["hr"]), "blood_pressure_systolic_mmhg": round(vals["sys"]),
              "blood_pressure_diastolic_mmhg": round(vals["dia"]), "sensor_hardware": "Bio-Monitor ECG",
              "signal_quality": "good"}
    thermo = {"core_temp_c": round(vals["temp"], 2), "sensor_hardware": "Double Sensor Forehead",
              "signal_quality": "good"}
    if aid == "AST-03" and 120 <= m < 135:  # the heart sensor loses the signal
        cardio.update(heart_rate_bpm=None, blood_pressure_systolic_mmhg=None, blood_pressure_diastolic_mmhg=None,
                      signal_quality="lost")
    if aid == "AST-03" and 200 <= m < 215:  # the temperature sensor is noisy
        thermo.update(core_temp_c=round(vals["temp"] + rng.gauss(0, 0.25), 2), signal_quality="degraded")

    spe_active, spe_dose, rate = False, 0.0, 0.42 + rng.gauss(0, 0.02)
    if aid == "AST-02" and 200 <= m < 230:  # solar particle event: cumulative dose reaches 250 mSv
        spe_active, spe_dose, rate = True, round(250 * (m - 199) / 30, 1), 8.0

    source = "periodic_device_trigger" if m % 30 == 0 else "automated_sensor_stream"
    if aid == "AST-01" and m == 250:
        source = "manual_override"
    daily = None
    if m == 0:
        day = when.date()
        i = CREW_DATA[aid]["sleep"][2]
        daily = {"assessment_date": day.isoformat(), "sleep_hours_last_night": i,
                 "pvt_reaction_time_ms": CREW_DATA[aid]["pvt"], "sensor_hardware": "Actiwatch / PVT-B",
                 "signal_quality": "good"}
    return {
        "schema_version": "1.1",
        "header": {"packet_id": f"SEED-{aid}-{m:04d}", "astronaut_id": aid,
                   "measured_at": when.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": source},
        "mission_context": {"activity_state": vals["state"], "comm_latency_sec": 2.6,
                            "environment": {"cabin_co2_mmhg": round(max(vals["co2"], 0), 2)}},
        "biometrics": {
            "cardiovascular": cardio,
            "respiratory": {"spo2_percent": round(vals["spo2"], 1), "respiratory_rate_rpm": round(vals["rr"]),
                            "sensor_hardware": "Pulse Oximeter", "signal_quality": "good"},
            "thermoregulation": thermo},
        "daily_assessment": daily,
        "radiation_dosimetry": {"daily_rate_msv": round(max(rate, 0), 3),
                                "solar_particle_event": {"active": spe_active, "event_dose_msv": spe_dose},
                                "sensor_hardware": "RAD / Liulin Active Dosimeter", "signal_quality": "good"},
    }


# Manual captures of the crew: (minute, kind, body). Times are minutes from the start of the history.
CAPTURES = {
    "AST-01": [(10, "blood-pressure", {"systolic": 118, "diastolic": 76}), (5, "glucose", {"value": 88, "context": "fasting"}),
               (15, "phq9", {"answers": [0, 1, 0, 0, 1, 0, 0, 0, 0]}), (16, "gad7", {"answers": [1, 0, 1, 0, 0, 1, 0]}),
               (130, "glucose", {"value": 132, "context": "postprandial"}),
               (170, "log", {"type": "ared_session", "note": "resistive exercise, 45 min"}),
               (200, "blood-pressure", {"systolic": 121, "diastolic": 78}),
               (230, "log", {"type": "headache", "note": "mild, after the CO2 alert"})],
    "AST-02": [(20, "blood-pressure", {"systolic": 128, "diastolic": 84}), (25, "glucose", {"value": 94, "context": "fasting"}),
               (30, "phq9", {"answers": [1, 1, 1, 1, 0, 1, 1, 0, 0]}), (31, "gad7", {"answers": [1, 1, 0, 1, 1, 0, 1]}),
               (140, "glucose", {"value": 165, "context": "postprandial"}),
               (170, "log", {"type": "ared_session", "note": "resistive exercise, 45 min"}),
               (205, "log", {"type": "radiation_shelter", "note": "moved to the shielded shelter"}),
               (240, "log", {"type": "radiation_shelter", "note": "left the shelter after the all clear"})],
    "AST-03": [(30, "blood-pressure", {"systolic": 146, "diastolic": 94}), (40, "glucose", {"value": 64, "context": "fasting"}),
               (42, "log", {"type": "carbs_15g", "note": "15 g of fast carbohydrates"}),
               (60, "glucose", {"value": 88, "context": "fasting"}),
               (80, "phq9", {"answers": [2, 2, 1, 2, 1, 2, 1, 0, 1]}), (82, "gad7", {"answers": [3, 2, 2, 3, 2, 2, 2]}),
               (100, "log", {"type": "headache"}), (250, "log", {"type": "blurred_vision"}),
               (260, "log", {"type": "headache", "note": "with the blurred vision"}),
               (330, "blood-pressure", {"systolic": 150, "diastolic": 96})],
}


# Saved questionnaires, as the front would send them: (kind, answers, severity, recommendation).
# The recommendations are made up for the demo; the real ones are written by the front.
QUESTIONNAIRES = {
    "AST-01": [("phq9", [0, 1, 0, 0, 1, 0, 0, 0, 0], "Minimal", "No action. Repeat at the next check-up."),
               ("gad7", [1, 0, 1, 0, 0, 1, 0], "Minimal", "No action. Repeat at the next check-up.")],
    "AST-02": [("phq9", [1, 1, 1, 1, 0, 1, 1, 0, 0], "Mild", "Monitor; repeat the questionnaire at the next check-up."),
               ("gad7", [1, 1, 0, 1, 1, 0, 1], "Mild", "Monitor; repeat the questionnaire at the next check-up.")],
    "AST-03": [("phq9", [2, 2, 1, 2, 1, 2, 1, 0, 1], "Moderate",
                "Follow-up plan with the behavioral health team. Question 9 is greater than 0: assess the risk now."),
               ("gad7", [3, 2, 2, 3, 2, 2, 2], "Severe", "Priority assessment with the behavioral health team.")],
}


def questionnaire_json(kind: str, answers: list, severity: str, recommendation: str, name: str, answered_at: datetime) -> dict:
    """What the front sends: the required fields plus whatever else it wants to keep."""
    return {"questionnaire": kind, "version": "PHQ-9" if kind == "phq9" else "GAD-7", "language": "en-US",
            "answered_by": name, "answered_at": answered_at.strftime("%Y-%m-%dT%H:%M:%SZ"), "answers": answers,
            "items": [{"n": i + 1, "answer": a} for i, a in enumerate(answers)], "score": sum(answers),
            "severity": severity, "recommendation": recommendation}


def post_questionnaires(station: httpx.Client, base: datetime) -> int:
    """Save the demo questionnaires through the real endpoint (the PHQ-9 at `base`, the GAD-7 two minutes later)."""
    saved = 0
    for aid, items in QUESTIONNAIRES.items():
        for i, (kind, answers, severity, recommendation) in enumerate(items):
            body = questionnaire_json(kind, answers, severity, recommendation, CREW_DATA[aid]["profile"]["name"],
                                      base + timedelta(minutes=2 * i))
            station.post(f"/api/crew/{aid}/questionnaires", json=body).raise_for_status()
            saved += 1
    return saved


def upload_history() -> tuple[int, int, int]:
    """Upload the demo data to Earth as old data (alerts keep the time they happened and are not sent back).
    Returns how many readings, manual captures and questionnaires were sent."""
    readings = manual = questionnaires = 0
    with httpx.Client(timeout=120) as up:
        while True:
            batch = store.pending_uplink(0)
            mine = {"readings": [r for r in batch["readings"] if str(r["astronaut_id"]).startswith("AST-0")],
                    "manual": [r for r in batch["manual"] if str(r["astronaut_id"]).startswith("AST-0")],
                    "questionnaires": [r for r in batch["questionnaires"] if str(r["astronaut_id"]).startswith("AST-0")],
                    "symptoms": [],
                    "changes": [r for r in batch["changes"]
                                if r["astronaut_id"] is None or str(r["astronaut_id"]).startswith("AST-0")]}
            if not any(mine.values()):
                break
            payload = jsonable_encoder({
                "readings": [{k: v for k, v in r.items() if k != "id"} for r in mine["readings"]],
                "manual": [{k: v for k, v in r.items() if k != "id"} for r in mine["manual"]],
                "questionnaires": [{k: v for k, v in r.items() if k != "id"} for r in mine["questionnaires"]],
                "changes": mine["changes"]})
            up.post(f"{EARTH_URL}/api/sync", params={"backfill": "true"}, json=payload).raise_for_status()
            store.mark_uplinked(mine)
            readings += len(mine["readings"])
            manual += len(mine["manual"])
            questionnaires += len(mine["questionnaires"])
    return readings, manual, questionnaires


def add_questionnaires_only(station: httpx.Client) -> int:
    """For a database that was seeded before the questionnaires existed: add just them, the same careful way."""
    if station.get("/api/crew/AST-01/questionnaires", params={"limit": 1}).json():
        return 0
    station.put("/api/sim/mission", json={"link_up": False}, headers=SIM).raise_for_status()
    try:
        added = post_questionnaires(station, datetime.now(timezone.utc).replace(second=0, microsecond=0) - timedelta(hours=26))
        upload_history()
    finally:
        station.put("/api/sim/mission", json={"link_up": True}, headers=SIM)
    return added


def main() -> int:
    station = httpx.Client(base_url=STATION, timeout=60)
    earth = httpx.Client(base_url=EARTH_URL, timeout=60)

    marker = station.get("/api/readings", params={"astronaut_id": "AST-01", "limit": 1}).json()
    if marker and str(marker[0].get("packet_id") or "").startswith("SEED-"):
        added = add_questionnaires_only(station)
        print("Already seeded (AST-01 has demo packets)." + (f" Added {added} saved questionnaires." if added else " Nothing to do."))
        return 0

    now = datetime.now(timezone.utc)
    end = now.replace(second=0, microsecond=0) - timedelta(minutes=2)
    start = end - timedelta(minutes=HISTORY_MINUTES - 1)
    started = time.time()

    # 1. Earth writes the record and the rules; they travel to the station after the link latency.
    print("1/5  Earth: profiles, personal thresholds, exercise goals, notes")
    station.put("/api/sim/mission", json={"mission_day": 78, "link_latency_seconds": 2.6, "time_scale": 1,
                                          "link_up": True}, headers=SIM).raise_for_status()
    for aid, data in CREW_DATA.items():
        earth.put(f"/api/astronauts/{aid}", json=data["profile"], headers=DOCTOR).raise_for_status()
        if "thresholds" in data:
            earth.put(f"/api/astronauts/{aid}/thresholds", json=data["thresholds"], headers=DOCTOR).raise_for_status()
        earth.put(f"/api/astronauts/{aid}/exercise-goals", json=data["goals"], headers=DOCTOR).raise_for_status()
    for aid, notes in NOTES.items():
        for kind, body in notes:
            earth.post(f"/api/astronauts/{aid}/notes", json={"body": body, "kind": kind}, headers=DOCTOR).raise_for_status()
    for _ in range(40):  # wait until the station has the rules
        if all(station.get(f"/api/crew/{a}/config").json().get("profile") for a in CREW_DATA) and \
                station.get("/api/crew/AST-02/config").json().get("thresholds"):
            break
        time.sleep(1)

    # 2. While the history is loaded the link is held down, so the station does not upload it as if it were live.
    station.put("/api/sim/mission", json={"link_up": False}, headers=SIM).raise_for_status()
    try:
        print(f"2/5  Station: {HISTORY_MINUTES} packets for each astronaut (v1.1 format)")
        rng = random.Random(2026)
        bodies = {aid: Body(aid, rng) for aid in CREW_DATA}
        for aid, data in CREW_DATA.items():  # the two previous nights, so the nights in a row can be counted
            for back, hours in ((48, data["sleep"][0]), (24, data["sleep"][1])):
                when = start - timedelta(hours=back)
                station.post("/api/sim/packet", headers=SIM, json={
                    "schema_version": "1.1",
                    "header": {"packet_id": f"SEED-{aid}-D{back}", "astronaut_id": aid,
                               "measured_at": when.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "periodic_device_trigger"},
                    "daily_assessment": {"assessment_date": when.date().isoformat(), "sleep_hours_last_night": hours,
                                         "pvt_reaction_time_ms": data["pvt"], "sensor_hardware": "Actiwatch / PVT-B",
                                         "signal_quality": "good"}}).raise_for_status()
        for m in range(HISTORY_MINUTES):
            when = start + timedelta(minutes=m)
            for aid in CREW_DATA:
                packet = build_packet(aid, m, when, bodies[aid].step(m), rng)
                station.post("/api/sim/packet", json=packet, headers=SIM).raise_for_status()
            if m == 0:  # the accumulated dose so far, then the station keeps adding
                for aid, data in CREW_DATA.items():
                    station.put(f"/api/sim/astronauts/{aid}/radiation", json={"mission_dose_msv": data["dose"]},
                                headers=SIM).raise_for_status()
            if m % 60 == 59:
                print(f"       ... {m + 1} of {HISTORY_MINUTES} minutes")

        print("3/5  Station: manual captures of the crew")
        for aid, captures in CAPTURES.items():
            for minute, path, body in captures:
                at = (start + timedelta(minutes=minute)).isoformat()
                station.post(f"/api/crew/{aid}/{path}", json={**body, "captured_at": at},
                             headers=CREW).raise_for_status()
        saved = post_questionnaires(station, start - timedelta(hours=2))
        print(f"       and {saved} saved questionnaires (PHQ-9 and GAD-7, as the front sends them)")

        # 4. Upload the history to Earth as old data: alerts keep the time they happened and are not sent back.
        print("4/5  Uplink: history to Earth (alerts dated when they happened)")
        sent_readings, sent_manual, sent_questionnaires = upload_history()
        print(f"       {sent_readings} readings, {sent_manual} manual captures and {sent_questionnaires} questionnaires sent")
    finally:
        station.put("/api/sim/mission", json={"link_up": True}, headers=SIM)

    print("5/5  Check")
    alerts = earth.get("/api/alerts", params={"limit": 200}).json()
    mine = [a for a in alerts if str(a["astronaut_id"]).startswith("AST-0")]
    print(f"       Earth: {len(mine)} alerts for AST-01..03, "
          f"{len(earth.get('/api/changes', params={'limit': 1000}).json())} entries in the change log")
    for a in earth.get("/api/astronauts").json():
        if a["astronaut_id"].startswith("AST-0"):
            print(f"       {a['astronaut_id']}  {a['name']:<16} {a['level']}")
    print(f"Done in {time.time() - started:.0f} s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
