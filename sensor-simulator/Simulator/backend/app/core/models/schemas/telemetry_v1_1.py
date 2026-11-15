from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

SignalQuality = Literal["good", "degraded", "lost"]
ActivityState = Literal[
    "resting",
    "sleeping",
    "working",
    "exercising",
    "post_exercise_recovery",
    "eva",
]
TelemetrySource = Literal[
    "automated_sensor_stream",
    "periodic_device_trigger",
    "manual_override",
]
ClinicalStatus = Literal["normal", "attention", "critical"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TelemetryHeader(StrictModel):
    packet_id: str = Field(..., min_length=5)
    astronaut_id: str = Field(..., pattern=r"^AST-[0-9]{2,4}$")
    measured_at: datetime
    source: TelemetrySource


class EnvironmentContext(StrictModel):
    cabin_co2_mmhg: Optional[float] = Field(None, ge=0, le=50)


class MissionContext(StrictModel):
    activity_state: ActivityState
    comm_latency_sec: float = Field(..., ge=0)
    environment: EnvironmentContext


class CardiovascularBiometrics(StrictModel):
    heart_rate_bpm: Optional[int] = Field(None, ge=20, le=240)
    blood_pressure_systolic_mmhg: Optional[int] = Field(None, ge=40, le=260)
    blood_pressure_diastolic_mmhg: Optional[int] = Field(None, ge=20, le=160)
    sensor_hardware: str
    signal_quality: SignalQuality

    @model_validator(mode="after")
    def enforce_null_on_lost(self):
        if self.signal_quality == "lost" and any(
            v is not None
            for v in (
                self.heart_rate_bpm,
                self.blood_pressure_systolic_mmhg,
                self.blood_pressure_diastolic_mmhg,
            )
        ):
            raise ValueError("Cardiovascular values must be null when signal_quality is 'lost'")
        return self


class RespiratoryBiometrics(StrictModel):
    spo2_percent: Optional[float] = Field(None, ge=50, le=100)
    respiratory_rate_rpm: Optional[int] = Field(None, ge=4, le=60)
    sensor_hardware: str
    signal_quality: SignalQuality

    @model_validator(mode="after")
    def enforce_null_on_lost(self):
        if self.signal_quality == "lost" and (
            self.spo2_percent is not None or self.respiratory_rate_rpm is not None
        ):
            raise ValueError("Respiratory values must be null when signal_quality is 'lost'")
        return self


class ThermoregulationBiometrics(StrictModel):
    core_temp_c: Optional[float] = Field(None, ge=30.0, le=44.0)
    sensor_hardware: str
    signal_quality: SignalQuality

    @model_validator(mode="after")
    def enforce_null_on_lost(self):
        if self.signal_quality == "lost" and self.core_temp_c is not None:
            raise ValueError("core_temp_c must be null when signal_quality is 'lost'")
        return self


class BiometricsBlock(StrictModel):
    cardiovascular: CardiovascularBiometrics
    respiratory: RespiratoryBiometrics
    thermoregulation: ThermoregulationBiometrics


class DailyAssessment(StrictModel):
    assessment_date: date
    sleep_hours_last_night: Optional[float] = Field(None, ge=0, le=24)
    pvt_reaction_time_ms: Optional[int] = Field(None, ge=100, le=5000)
    sensor_hardware: str
    signal_quality: SignalQuality

    @model_validator(mode="after")
    def enforce_null_on_lost(self):
        if self.signal_quality == "lost" and (
            self.sleep_hours_last_night is not None or self.pvt_reaction_time_ms is not None
        ):
            raise ValueError("Daily assessment values must be null when signal_quality is 'lost'")
        return self


class SolarParticleEvent(StrictModel):
    active: bool
    event_dose_msv: Optional[float] = Field(None, ge=0)


class RadiationDosimetry(StrictModel):
    daily_rate_msv: Optional[float] = Field(None, ge=0)
    solar_particle_event: SolarParticleEvent
    sensor_hardware: str
    signal_quality: SignalQuality

    @model_validator(mode="after")
    def enforce_null_on_lost(self):
        if self.signal_quality == "lost" and (
            self.daily_rate_msv is not None or self.solar_particle_event.event_dose_msv is not None
        ):
            raise ValueError("Radiation values must be null when signal_quality is 'lost'")
        return self


class TelemetryPacketV1_1(StrictModel):
    schema_version: Literal["1.1"] = "1.1"
    header: TelemetryHeader
    mission_context: MissionContext
    biometrics: BiometricsBlock
    daily_assessment: Optional[DailyAssessment] = None
    radiation_dosimetry: RadiationDosimetry


class ClinicalAlert(BaseModel):
    system: str
    severity: ClinicalStatus
    nasa_hazard: str
    message: str
    recommended_action: str


class EvaluatedTelemetryResponse(BaseModel):
    packet_id: str
    astronaut_id: str
    measured_at: datetime
    received_at: datetime
    mission_day: int
    activity_state: ActivityState
    comm_latency_sec: float
    overall_status: ClinicalStatus
    consecutive_nights_under_6h: int
    mission_accumulated_msv: float
    career_accumulated_msv: float
    career_limit_msv: float
    alerts: list[ClinicalAlert]
    telemetry: TelemetryPacketV1_1