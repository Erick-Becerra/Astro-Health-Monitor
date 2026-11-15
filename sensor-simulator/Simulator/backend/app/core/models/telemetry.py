from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String
from app.core.database import Base


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id = Column(Integer, primary_key=True, index=True)
    packet_id = Column(String(64), unique=True, index=True, nullable=False)
    astronaut_id = Column(String(16), ForeignKey("astronauts.astronaut_id"), index=True, nullable=False)
    schema_version = Column(String(10), nullable=False)
    source = Column(String(32), nullable=False)

    # Timestamps (edge measurement vs server ingestion)
    measured_at = Column(DateTime(timezone=True), index=True, nullable=False)
    received_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Derived operational fields
    mission_day = Column(Integer, nullable=False)
    activity_state = Column(String(32), nullable=False)
    comm_latency_sec = Column(Float, nullable=False)
    cabin_co2_mmhg = Column(Float, nullable=True)

    # Biometrics
    heart_rate_bpm = Column(Integer, nullable=True)
    bp_systolic_mmhg = Column(Integer, nullable=True)
    bp_diastolic_mmhg = Column(Integer, nullable=True)
    cv_signal_quality = Column(String(16), nullable=False)

    spo2_percent = Column(Float, nullable=True)
    respiratory_rate_rpm = Column(Integer, nullable=True)
    resp_signal_quality = Column(String(16), nullable=False)

    core_temp_c = Column(Float, nullable=True)
    temp_signal_quality = Column(String(16), nullable=False)

    # Daily assessment (nullable)
    assessment_date = Column(Date, nullable=True)
    sleep_hours_last_night = Column(Float, nullable=True)
    pvt_reaction_time_ms = Column(Integer, nullable=True)
    consecutive_nights_under_6h = Column(Integer, default=0, nullable=False)

    # Radiation dosimetry
    daily_rate_msv = Column(Float, nullable=True)
    spe_active = Column(Boolean, default=False, nullable=False)
    spe_event_dose_msv = Column(Float, nullable=True)
    mission_accumulated_msv = Column(Float, nullable=False)
    career_accumulated_msv = Column(Float, nullable=False)
    rad_signal_quality = Column(String(16), nullable=False)

    # Backend-evaluated clinical state ("normal" | "attention" | "critical")
    overall_status = Column(String(16), index=True, nullable=False)
    alerts_json = Column(JSON, default=list, nullable=False)
    raw_payload = Column(JSON, nullable=False)