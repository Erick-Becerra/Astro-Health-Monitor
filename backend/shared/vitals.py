"""Data format of a reading and the classification of its values.

The message format follows docs/data-format.md. The RULES (what is Normal, Caution, Moderate risk or Critical, and the
message and procedure of each) live in shared/indicators.py, taken from the "Health Indicators Structure" document.

Two ways to say how an astronaut is doing, kept side by side:
  level   green | yellow | orange | red     Normal | Caution | Moderate risk | Critical
  status  ok    | attention | critical      (older, 3 values; orange counts as attention)
"""
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .indicators import (ADJUSTABLE, LEVEL_NAME, LEVEL_ORDER, LEVEL_TO_STATUS, adjustable_defaults,  # noqa: F401
                         evaluate_telemetry)
from .variables import rng

STATUS_ORDER = {"ok": 0, "attention": 1, "critical": 2}

# Columns of a telemetry reading, in the order they are stored.
TELEMETRY_FIELDS = [
    "heart_rate", "hrv_ms", "body_temperature", "blood_pressure_systolic", "blood_pressure_diastolic",
    "sleep_hours", "consecutive_nights_under_6h", "consecutive_nights_under_4h", "pvt_b_ms", "spo2",
    "respiratory_rate", "radiation_rate_msv_day", "radiation_dose_msv", "spe_active", "spe_event_dose_msv",
    "cabin_co2_mmhg", "crew_state", "mission_day",
]
READING_FIELDS = TELEMETRY_FIELDS + ["packet_id", "meta"]


class Reading(BaseModel):
    """One set of measurements for one astronaut at one moment.

    Only astronaut_id and timestamp are required: the simulator may send just
    the variables it changed, and blood pressure is normally a manual capture.
    `meta` is what the packet said about itself and what the station worked out: source, sensor hardware, signal
    quality per sensor, since when a sensor has no signal (`signal_lost_since`) and since when the astronaut is in
    the current activity (`state_since`).
    """

    astronaut_id: str = Field(min_length=1, max_length=32, examples=["A001"])
    timestamp: datetime = Field(examples=["2026-11-14T10:30:00Z"])
    heart_rate: Optional[float] = Field(None, description="beats per minute", **rng("heart_rate"))
    hrv_ms: Optional[float] = Field(None, description="milliseconds", **rng("hrv_ms"))
    body_temperature: Optional[float] = Field(None, description="degrees Celsius", **rng("body_temperature"))
    blood_pressure_systolic: Optional[float] = Field(None, description="mmHg", **rng("blood_pressure_systolic"))
    blood_pressure_diastolic: Optional[float] = Field(None, description="mmHg", **rng("blood_pressure_diastolic"))
    sleep_hours: Optional[float] = Field(None, **rng("sleep_hours"))
    consecutive_nights_under_6h: Optional[int] = Field(None, **rng("consecutive_nights_under_6h"))
    consecutive_nights_under_4h: Optional[int] = Field(None, **rng("consecutive_nights_under_4h"))
    pvt_b_ms: Optional[float] = Field(None, **rng("pvt_b_ms"))
    spo2: Optional[float] = Field(None, **rng("spo2"))
    respiratory_rate: Optional[float] = Field(None, **rng("respiratory_rate"))
    radiation_rate_msv_day: Optional[float] = Field(None, **rng("radiation_rate_msv_day"))
    radiation_dose_msv: Optional[float] = Field(None, **rng("radiation_dose_msv"))
    spe_active: Optional[bool] = None
    spe_event_dose_msv: Optional[float] = Field(None, **rng("spe_event_dose_msv"))
    cabin_co2_mmhg: Optional[float] = Field(None, **rng("cabin_co2_mmhg"))
    crew_state: Optional[Literal["resting", "sleeping", "working", "exercising", "post_exercise_recovery",
                                 "eva"]] = None
    mission_day: Optional[int] = Field(None, **rng("mission_day"))
    packet_id: Optional[str] = Field(None, max_length=64)
    meta: Optional[dict] = None

    @field_validator("timestamp")
    @classmethod
    def _assume_utc(cls, value: datetime) -> datetime:
        # A timestamp without a time zone is read as UTC.
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class TelemetryBatch(BaseModel):
    """What the station sends to Earth: one or many readings."""

    readings: list[Reading] = Field(min_length=1, max_length=1000)


def worst_level(levels) -> str:
    best = "green"
    for level in levels:
        if level and LEVEL_ORDER[level] > LEVEL_ORDER[best]:
            best = level
    return best


def classify(reading, overrides: Optional[dict] = None, profile: Optional[dict] = None) -> dict:
    """Return the overall level/status plus one finding per indicator that is not Normal.

    `reading` is a Reading, or a dict (a row of readings: it may carry `meta` and `measured_at` / `timestamp`).
    `overrides` are the astronaut's personal thresholds {indicator: {"yellow": x, "orange": y, "red": z}} and
    `profile` is the astronaut's record (it gives the baseline reaction time).

    Each finding says what is wrong (`message`), what to do (`action`) and the steps (`procedure`), taken from the
    document of indicators, and the rule that matched (`criteria`). `advice` is the same as `action`.
    """
    if isinstance(reading, BaseModel):
        values, meta, at = reading.model_dump(), reading.meta, reading.timestamp
    else:
        values = dict(reading)
        meta, at = values.get("meta"), values.get("measured_at") or values.get("timestamp")
    findings = evaluate_telemetry(values, at=at, meta=meta, profile=profile, overrides=overrides)
    overall = worst_level(f["level"] for f in findings)
    return {"level": overall, "status": LEVEL_TO_STATUS[overall], "level_name": LEVEL_NAME[overall],
            "findings": findings}


def _steps(procedure: list[str]) -> str:
    return " ".join(f"{i}. {step}" for i, step in enumerate(procedure, 1))


def describe(astronaut_id: str, result: dict) -> tuple[str, str]:
    """Build the (summary, guidance) text of an alert from a classify() result: the simulator message of
    each worst finding, and its recommended action with the procedure."""
    # The worst findings, and always a solar particle event (it needs its own words even when the radiation
    # rate that came with it is the worse one).
    worst = [f for f in result["findings"] if f["level"] == result["level"] or f["indicator"] == "spe_active"]
    summary = f"{astronaut_id}: " + " ".join(f"{f['label']}: {f['message']}".strip() for f in worst)
    guidance = " ".join(f"{f['action']} Procedure: {_steps(f['procedure'])}" for f in worst)
    return summary, guidance


def worse_than(new: str, old: Optional[str]) -> bool:
    """True when status `new` is more serious than `old` (None counts as ok)."""
    return STATUS_ORDER[new] > STATUS_ORDER.get(old or "ok", 0)
