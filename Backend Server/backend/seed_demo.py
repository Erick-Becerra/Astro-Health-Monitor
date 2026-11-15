"""Loads a few hours of demo history into the Earth base, so charts and alerts
have something to show from the first minute.

Run it once, from the project folder:
    docker compose exec -T earth-base python seed_demo.py

It is safe to run again: history always ends just before the first live
reading, with fixed timestamps, so a second run adds nothing new.
Options:  --hours 6   how far back the history goes
"""
import argparse
import random
from datetime import datetime, timedelta

import httpx

from shared.config import SIM_ASTRONAUTS
from space_station.simulator import NOISE, PULL, SCENARIOS, Simulator

EARTH = "http://localhost:8000"

# (astronaut, scenario, start minute, duration in minutes), counted from the
# start of the history. Together they cover ok, attention and critical.
EVENTS = [
    ("A003", "hypertension", 40, 50),   # blood pressure climbs, then settles
    ("A001", "solar_storm", 100, 40),   # whole-body stress response
    ("A002", "fever", 150, 120),        # temperature rises to critical, then recovers
    ("A003", "tachycardia", 270, 45),   # fast pulse near the end
    ("A001", "hypothermia", 310, 25),
]


# Record and pre-flight baseline of the demo crew. Everything here is made up.
PROFILES = {
    "A001": {"name": "Mateo Rojas", "gender": "male", "birth_date": "1985-03-12", "weight_kg": 78.0,
             "agency": "NASA", "baseline_hr": 58, "baseline_bp_systolic": 114, "baseline_bp_diastolic": 72,
             "dxa_t_score": -0.4, "prior_radiation_msv": 85},
    "A002": {"name": "Valentina Soto", "gender": "female", "birth_date": "1988-07-30", "weight_kg": 62.5,
             "agency": "ESA", "baseline_hr": 62, "baseline_bp_systolic": 108, "baseline_bp_diastolic": 68,
             "dxa_t_score": -0.9, "prior_radiation_msv": 120},
    "A003": {"name": "Camila Reyes", "gender": "female", "birth_date": "1990-11-05", "weight_kg": 58.0,
             "agency": "CSA", "baseline_hr": 60, "baseline_bp_systolic": 110, "baseline_bp_diastolic": 70,
             "dxa_t_score": -1.3, "prior_radiation_msv": 40},
}


def scenario_at(astronaut_id: str, minute: int):
    for who, name, start, length in EVENTS:
        if who == astronaut_id and start <= minute < start + length:
            return SCENARIOS[name]
    return {}


def build(astronaut_id: str, baseline: dict, start: datetime, minutes: int, rng: random.Random):
    values = dict(baseline)
    readings = []
    for minute in range(minutes):
        offsets = scenario_at(astronaut_id, minute)
        for key in values:
            target = baseline[key] + offsets.get(key, 0.0)
            values[key] += PULL * (target - values[key]) + rng.gauss(0, NOISE[key])
        readings.append({
            "astronaut_id": astronaut_id,
            "timestamp": (start + timedelta(minutes=minute)).isoformat(),
            "heart_rate": round(values["heart_rate"], 1),
            "body_temperature": round(values["body_temperature"], 2),
            "blood_pressure_systolic": round(values["blood_pressure_systolic"]),
            "blood_pressure_diastolic": round(values["blood_pressure_diastolic"]),
        })
    return readings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=6)
    hours = parser.parse_args().hours
    minutes = hours * 60

    with httpx.Client(base_url=EARTH, timeout=60) as client:
        crew = client.get("/api/astronauts").json()
        if crew:  # end just before the first live reading
            end = min(datetime.fromisoformat(a["first_seen"]) for a in crew)
        else:
            end = datetime.now().astimezone()
        end = end.replace(second=0, microsecond=0) - timedelta(minutes=1)
        start = end - timedelta(minutes=minutes - 1)

        baselines = Simulator(SIM_ASTRONAUTS).baselines
        rng = random.Random(7)
        stored = alerts = 0
        for astronaut_id in SIM_ASTRONAUTS:
            readings = build(astronaut_id, baselines[astronaut_id], start, minutes, rng)
            for i in range(0, len(readings), 500):
                response = client.post("/api/telemetry", params={"backfill": "true"},
                                       json={"readings": readings[i:i + 500]})
                response.raise_for_status()
                body = response.json()
                stored += body["stored"]
                alerts += body["alerts_created"]
        # Profiles go last: registering an astronaut sets "first_seen", which the
        # history end point above is read from.
        for astronaut_id, profile in PROFILES.items():
            client.put(f"/api/astronauts/{astronaut_id}", json=profile,
                       headers={"X-Actor": "seed_demo"}).raise_for_status()
        print(f"History {start:%Y-%m-%d %H:%M} to {end:%H:%M}: "
              f"{stored} readings stored, {alerts} alerts created, {len(PROFILES)} profiles set.")


if __name__ == "__main__":
    main()
