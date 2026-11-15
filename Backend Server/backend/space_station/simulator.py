"""Generates believable vital signs for the simulated crew.

Each value drifts smoothly around a personal baseline with a little noise.
Scenarios push the target away from the baseline so the dashboard has
something to show (a fever, a fast pulse, ...). Scenarios can be started from
the station API while demoing.
"""
import random
from datetime import datetime, timezone

from shared.vitals import Reading

# Typical resting values. Every astronaut gets a small personal offset.
BASELINE = {
    "heart_rate": 68.0,
    "body_temperature": 36.7,
    "blood_pressure_systolic": 116.0,
    "blood_pressure_diastolic": 74.0,
}
NOISE = {
    "heart_rate": 1.6,
    "body_temperature": 0.04,
    "blood_pressure_systolic": 1.8,
    "blood_pressure_diastolic": 1.2,
}
PULL = 0.15  # how fast a value moves toward its target (0 to 1)
# How far each astronaut's resting baseline may differ from the typical one (+/- fraction).
PERSONAL_SPREAD = {
    "heart_rate": 0.08,
    "body_temperature": 0.004,   # +/- 0.15 degrees: body temperature varies very little
    "blood_pressure_systolic": 0.05,
    "blood_pressure_diastolic": 0.05,
}

# Offsets added to the baseline while a scenario is active.
SCENARIOS = {
    "fever": {"body_temperature": 1.9, "heart_rate": 18},
    "tachycardia": {"heart_rate": 62},
    "hypertension": {"blood_pressure_systolic": 38, "blood_pressure_diastolic": 20},
    "hypothermia": {"body_temperature": -1.9},
    "solar_storm": {"heart_rate": 28, "body_temperature": 0.9, "blood_pressure_systolic": 16},
}


class Simulator:
    def __init__(self, astronaut_ids: list[str]):
        rng = random.Random(42)  # same crew "personalities" on every start
        self.baselines = {
            a: {k: v * (1 + rng.uniform(-PERSONAL_SPREAD[k], PERSONAL_SPREAD[k]))
                for k, v in BASELINE.items()}
            for a in astronaut_ids
        }
        self.values = {a: dict(b) for a, b in self.baselines.items()}
        self.active: dict[str, tuple[str, float]] = {}  # astronaut -> (scenario, ends at)

    def start_scenario(self, astronaut_id: str, scenario: str, seconds: float, now: float) -> None:
        self.active[astronaut_id] = (scenario, now + seconds)

    def clear_scenario(self, astronaut_id: str | None = None) -> None:
        if astronaut_id is None:
            self.active.clear()
        else:
            self.active.pop(astronaut_id, None)

    def running(self, now: float) -> list[dict]:
        return [
            {"astronaut_id": a, "scenario": s, "seconds_left": round(end - now)}
            for a, (s, end) in self.active.items()
            if end > now
        ]

    def tick(self, now: float) -> list[Reading]:
        """One new reading per astronaut."""
        stamp = datetime.now(timezone.utc).replace(microsecond=0)
        readings = []
        for astronaut_id, value in self.values.items():
            scenario = self.active.get(astronaut_id)
            if scenario and scenario[1] <= now:
                del self.active[astronaut_id]
                scenario = None
            offsets = SCENARIOS[scenario[0]] if scenario else {}
            for key in value:
                target = self.baselines[astronaut_id][key] + offsets.get(key, 0.0)
                value[key] += PULL * (target - value[key]) + random.gauss(0, NOISE[key])
            readings.append(Reading(
                astronaut_id=astronaut_id,
                timestamp=stamp,
                heart_rate=round(value["heart_rate"], 1),
                body_temperature=round(value["body_temperature"], 2),
                blood_pressure_systolic=round(value["blood_pressure_systolic"]),
                blood_pressure_diastolic=round(value["blood_pressure_diastolic"]),
            ))
        return readings
