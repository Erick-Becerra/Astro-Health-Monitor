"""The packet the simulator app (App 3) sends, schema v1.1, and how it maps to our variables.

Rules of reading a packet:
  * A section or a field that is ABSENT means "no change": the variable keeps its last value.
  * A field that is null means "the sensor has no reading": the last value is cleared.
  * signal_quality "lost" clears every value of its group; "degraded" keeps the value and flags it.
  * daily_assessment null (or absent) means "no assessment in this packet".
  * mood_assessment null (or absent) means "no PHQ-9 / GAD-7 in this packet"; when it comes, the two scores are
    checked (the total is the sum of the item scores, item9_positive agrees with item 9) and each one is kept as a
    manual capture of the astronaut, so it counts for the colours and for the item 9 alert.
  * Unknown keys are ignored, so the simulator can add fields without breaking anything.

    {"schema_version": "1.1",
     "header": {"packet_id", "astronaut_id", "measured_at", "source"},
     "mission_context": {"activity_state", "comm_latency_sec", "environment": {"cabin_co2_mmhg"}},
     "biometrics": {"cardiovascular": {...}, "respiratory": {...}, "thermoregulation": {...}},
     "daily_assessment": null | {"assessment_date", "sleep_hours_last_night", "pvt_reaction_time_ms", ...},
     "radiation_dosimetry": {"daily_rate_msv", "solar_particle_event": {"active", "event_dose_msv"}, ...}}
"""
from datetime import date, datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .variables import CREW_STATE_ALIASES, CREW_STATES, rng

Quality = Literal["good", "degraded", "lost"]
Source = Literal["automated_sensor_stream", "periodic_device_trigger", "manual_override"]


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Header(_Loose):
    packet_id: Optional[str] = Field(None, max_length=64)
    astronaut_id: str = Field(min_length=1, max_length=32)
    measured_at: Optional[datetime] = None
    source: Optional[Source] = None


class Environment(_Loose):
    cabin_co2_mmhg: Optional[float] = Field(None, **rng("cabin_co2_mmhg"))


class MissionContext(_Loose):
    activity_state: Optional[str] = None
    comm_latency_sec: Optional[float] = Field(None, **rng("link_latency_seconds"))
    mission_day: Optional[int] = Field(None, **rng("mission_day"))  # not in v1.1, still accepted
    environment: Optional[Environment] = None

    @field_validator("activity_state")
    @classmethod
    def _known_state(cls, value):
        if value is None:
            return None
        state = CREW_STATE_ALIASES.get(value.strip().lower().replace(" ", "_"))
        if state is None:
            raise ValueError(f"unknown activity_state '{value}'. Use one of: {', '.join(CREW_STATES)}")
        return state


class Cardiovascular(_Loose):
    heart_rate_bpm: Optional[float] = Field(None, **rng("heart_rate"))
    blood_pressure_systolic_mmhg: Optional[float] = Field(None, **rng("blood_pressure_systolic"))
    blood_pressure_diastolic_mmhg: Optional[float] = Field(None, **rng("blood_pressure_diastolic"))
    hrv_ms: Optional[float] = Field(None, **rng("hrv_ms"))
    sensor_hardware: Optional[str] = None
    signal_quality: Optional[Quality] = None


class Respiratory(_Loose):
    spo2_percent: Optional[float] = Field(None, **rng("spo2"))
    respiratory_rate_rpm: Optional[float] = Field(None, **rng("respiratory_rate"))
    sensor_hardware: Optional[str] = None
    signal_quality: Optional[Quality] = None


class Thermoregulation(_Loose):
    core_temp_c: Optional[float] = Field(None, **rng("body_temperature"))
    sensor_hardware: Optional[str] = None
    signal_quality: Optional[Quality] = None


class Biometrics(_Loose):
    cardiovascular: Optional[Cardiovascular] = None
    respiratory: Optional[Respiratory] = None
    thermoregulation: Optional[Thermoregulation] = None


class DailyAssessment(_Loose):
    assessment_date: Optional[date] = None
    sleep_hours_last_night: Optional[float] = Field(None, **rng("sleep_hours"))
    pvt_reaction_time_ms: Optional[float] = Field(None, **rng("pvt_b_ms"))
    sensor_hardware: Optional[str] = None
    signal_quality: Optional[Quality] = None


class SolarParticleEvent(_Loose):
    active: Optional[bool] = None
    event_dose_msv: Optional[float] = Field(None, **rng("spe_event_dose_msv"))


class RadiationDosimetry(_Loose):
    daily_rate_msv: Optional[float] = Field(None, **rng("radiation_rate_msv_day"))
    mission_accumulated_msv: Optional[float] = Field(None, **rng("radiation_dose_msv"))  # not in v1.1
    solar_particle_event: Optional[SolarParticleEvent] = None
    sensor_hardware: Optional[str] = None
    signal_quality: Optional[Quality] = None


Score = Annotated[int, Field(ge=0, le=3)]


class Phq9Part(_Loose):
    item_scores: list[Score] = Field(min_length=9, max_length=9)
    total: int = Field(ge=0, le=27)
    item9_positive: bool

    @model_validator(mode="after")
    def _coherent(self):
        if self.total != sum(self.item_scores):
            raise ValueError(f"phq9 total {self.total} is not the sum of item_scores ({sum(self.item_scores)})")
        if self.item9_positive != (self.item_scores[8] > 0):
            raise ValueError("phq9 item9_positive must be true exactly when item 9 (the last item) is above 0")
        return self


class Gad7Part(_Loose):
    item_scores: list[Score] = Field(min_length=7, max_length=7)
    total: int = Field(ge=0, le=21)

    @model_validator(mode="after")
    def _coherent(self):
        if self.total != sum(self.item_scores):
            raise ValueError(f"gad7 total {self.total} is not the sum of item_scores ({sum(self.item_scores)})")
        return self


class MoodAssessment(_Loose):
    """The PHQ-9 and the GAD-7 answered together (points 14 and 15 of the indicators document)."""

    assessment_date: date
    phq9: Phq9Part
    gad7: Gad7Part


class SensorPacket(_Loose):
    schema_version: Optional[Literal["1.1"]] = None
    header: Header
    mission_context: Optional[MissionContext] = None
    biometrics: Optional[Biometrics] = None
    daily_assessment: Optional[DailyAssessment] = None
    mood_assessment: Optional[MoodAssessment] = None
    radiation_dosimetry: Optional[RadiationDosimetry] = None


# group field -> our variable
_CARDIO = {"heart_rate_bpm": "heart_rate", "blood_pressure_systolic_mmhg": "blood_pressure_systolic",
           "blood_pressure_diastolic_mmhg": "blood_pressure_diastolic", "hrv_ms": "hrv_ms"}
_RESP = {"spo2_percent": "spo2", "respiratory_rate_rpm": "respiratory_rate"}
_THERMO = {"core_temp_c": "body_temperature"}
_DAILY = {"sleep_hours_last_night": "sleep_hours", "pvt_reaction_time_ms": "pvt_b_ms"}


def to_values(packet: SensorPacket) -> dict:
    """Turn a packet into our own variable names.

    Returns {"astronaut_id", "timestamp", "packet_id", "values", "meta", "mission", "assessment", "mood"}.
      values      only the variables the packet speaks about; None means "clear it"
      meta        source, sensor hardware and signal quality per group (kept with the reading)
      mission     mission-wide settings carried by the packet (link latency, mission day)
      assessment  {"date", "sleep_hours"} when a daily assessment with sleep data came in
      mood        {"date", "phq9": [9 scores], "gad7": [7 scores]} when a mood assessment came in
    """
    values: dict = {}
    mission: dict = {}
    sensors: dict = {}
    quality: dict = {}
    meta: dict = {}

    def take(name: str, group, mapping: dict) -> None:
        if group is None:
            return
        if group.sensor_hardware:
            sensors[name] = group.sensor_hardware
        if group.signal_quality:
            quality[name] = group.signal_quality
        for field, key in mapping.items():
            if group.signal_quality == "lost":
                values[key] = None  # the sensor lost the signal: do not keep showing the old value
            elif field in group.model_fields_set:
                values[key] = getattr(group, field)

    ctx = packet.mission_context
    if ctx:
        if "activity_state" in ctx.model_fields_set and ctx.activity_state:
            values["crew_state"] = ctx.activity_state
        if ctx.comm_latency_sec is not None:
            mission["link_latency_seconds"] = ctx.comm_latency_sec
        if ctx.mission_day is not None:
            mission["mission_day"] = values["mission_day"] = ctx.mission_day
        if ctx.environment and "cabin_co2_mmhg" in ctx.environment.model_fields_set:
            values["cabin_co2_mmhg"] = ctx.environment.cabin_co2_mmhg

    bio = packet.biometrics
    if bio:
        take("cardiovascular", bio.cardiovascular, _CARDIO)
        take("respiratory", bio.respiratory, _RESP)
        take("thermoregulation", bio.thermoregulation, _THERMO)

    assessment = None
    daily = packet.daily_assessment
    if daily:
        take("daily_assessment", daily, _DAILY)
        if daily.assessment_date:
            meta["assessment_date"] = daily.assessment_date.isoformat()
        if daily.assessment_date and daily.sleep_hours_last_night is not None and daily.signal_quality != "lost":
            assessment = {"date": daily.assessment_date, "sleep_hours": daily.sleep_hours_last_night}

    rad = packet.radiation_dosimetry
    if rad:
        take("radiation_dosimetry", rad, {"daily_rate_msv": "radiation_rate_msv_day"})
        if rad.mission_accumulated_msv is not None and rad.signal_quality != "lost":
            values["radiation_dose_msv"] = rad.mission_accumulated_msv
        spe = rad.solar_particle_event
        if spe:
            if spe.active is not None:
                values["spe_active"] = spe.active
            if "event_dose_msv" in spe.model_fields_set:
                values["spe_event_dose_msv"] = None if rad.signal_quality == "lost" else spe.event_dose_msv

    if packet.header.source:
        meta["source"] = packet.header.source
    if sensors:
        meta["sensors"] = sensors
    if quality:
        meta["signal_quality"] = quality
    return {
        "astronaut_id": packet.header.astronaut_id,
        "timestamp": packet.header.measured_at,
        "packet_id": packet.header.packet_id,
        "values": values,
        "meta": meta or None,
        "mission": mission,
        "assessment": assessment,
        "mood": ({"date": packet.mood_assessment.assessment_date, "phq9": packet.mood_assessment.phq9.item_scores,
                  "gad7": packet.mood_assessment.gad7.item_scores} if packet.mood_assessment else None),
    }
