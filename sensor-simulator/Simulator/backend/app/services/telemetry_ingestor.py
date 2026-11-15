from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.astronaut import Astronaut
from app.models.telemetry import TelemetryRecord
from app.schemas.telemetry_v1_1 import EvaluatedTelemetryResponse, TelemetryPacketV1_1
from app.services.clinical_evaluator import evaluate_telemetry_packet


def ingest_telemetry_packet(db: Session, packet: TelemetryPacketV1_1) -> EvaluatedTelemetryResponse:
    # 1. Deduplicate by packet_id
    existing = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.packet_id == packet.header.packet_id)
        .first()
    )
    if existing:
        astronaut = (
            db.query(Astronaut)
            .filter(Astronaut.astronaut_id == existing.astronaut_id)
            .first()
        )
        return EvaluatedTelemetryResponse(
            packet_id=existing.packet_id,
            astronaut_id=existing.astronaut_id,
            measured_at=existing.measured_at,
            received_at=existing.received_at,
            mission_day=existing.mission_day,
            activity_state=existing.activity_state,
            comm_latency_sec=existing.comm_latency_sec,
            overall_status=existing.overall_status,
            consecutive_nights_under_6h=existing.consecutive_nights_under_6h,
            mission_accumulated_msv=existing.mission_accumulated_msv,
            career_accumulated_msv=existing.career_accumulated_msv,
            career_limit_msv=astronaut.career_radiation_limit_msv if astronaut else 600.0,
            alerts=existing.alerts_json,
            telemetry=TelemetryPacketV1_1.model_validate(existing.raw_payload),
        )

    # 2. Verify crew member exists
    astronaut = (
        db.query(Astronaut)
        .filter(Astronaut.astronaut_id == packet.header.astronaut_id)
        .first()
    )
    if not astronaut:
        raise HTTPException(
            status_code=404,
            detail=f"Astronaut '{packet.header.astronaut_id}' not found in mission registry.",
        )

    # 3. Fetch previous packet for time-delta integration & sleep streak
    prev_record = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.astronaut_id == astronaut.astronaut_id)
        .order_by(desc(TelemetryRecord.measured_at))
        .first()
    )

    # 4. Derive mission_day
    measured_utc = packet.header.measured_at.astimezone(timezone.utc)
    started_utc = astronaut.mission_started_at.astimezone(timezone.utc)
    mission_day = max(1, (measured_utc - started_utc).days + 1)

    # 5. Derive consecutive_nights_under_6h
    prev_streak = prev_record.consecutive_nights_under_6h if prev_record else 0
    if (
        packet.daily_assessment is not None
        and packet.daily_assessment.sleep_hours_last_night is not None
    ):
        if packet.daily_assessment.sleep_hours_last_night < 6.0:
            consecutive_under_6h = prev_streak + 1
        else:
            consecutive_under_6h = 0
    else:
        consecutive_under_6h = prev_streak

    # 6. Integrate radiation dose over elapsed interval
    incremental_msv = 0.0
    if packet.radiation_dosimetry.daily_rate_msv is not None:
        if prev_record is not None:
            elapsed_days = max(
                0.0,
                (measured_utc - prev_record.measured_at.astimezone(timezone.utc)).total_seconds()
                / 86400.0,
            )
            # Cap single-gap integration to 1 day to avoid unrealistic jumps during simulator pauses
            incremental_msv = packet.radiation_dosimetry.daily_rate_msv * min(elapsed_days, 1.0)
        else:
            incremental_msv = packet.radiation_dosimetry.daily_rate_msv * (1.0 / 86400.0)

    astronaut.mission_accumulated_msv = round(
        astronaut.mission_accumulated_msv + incremental_msv, 4
    )
    spe_dose = (
        packet.radiation_dosimetry.solar_particle_event.event_dose_msv or 0.0
        if packet.radiation_dosimetry.solar_particle_event.active
        else 0.0
    )
    career_total_msv = round(
        astronaut.prior_radiation_msv + astronaut.mission_accumulated_msv + spe_dose, 4
    )

    # 7. Run clinical threshold evaluation
    overall_status, alerts = evaluate_telemetry_packet(
        packet=packet,
        consecutive_nights_under_6h=consecutive_under_6h,
        career_accumulated_msv=career_total_msv,
        career_limit_msv=astronaut.career_radiation_limit_msv,
    )

    received_at = datetime.now(timezone.utc)
    alerts_serialized = [a.model_dump() for a in alerts]

    record = TelemetryRecord(
        packet_id=packet.header.packet_id,
        astronaut_id=astronaut.astronaut_id,
        schema_version=packet.schema_version,
        source=packet.header.source,
        measured_at=measured_utc,
        received_at=received_at,
        mission_day=mission_day,
        activity_state=packet.mission_context.activity_state,
        comm_latency_sec=packet.mission_context.comm_latency_sec,
        cabin_co2_mmhg=packet.mission_context.environment.cabin_co2_mmhg,
        heart_rate_bpm=packet.biometrics.cardiovascular.heart_rate_bpm,
        bp_systolic_mmhg=packet.biometrics.cardiovascular.blood_pressure_systolic_mmhg,
        bp_diastolic_mmhg=packet.biometrics.cardiovascular.blood_pressure_diastolic_mmhg,
        cv_signal_quality=packet.biometrics.cardiovascular.signal_quality,
        spo2_percent=packet.biometrics.respiratory.spo2_percent,
        respiratory_rate_rpm=packet.biometrics.respiratory.respiratory_rate_rpm,
        resp_signal_quality=packet.biometrics.respiratory.signal_quality,
        core_temp_c=packet.biometrics.thermoregulation.core_temp_c,
        temp_signal_quality=packet.biometrics.thermoregulation.signal_quality,
        assessment_date=packet.daily_assessment.assessment_date if packet.daily_assessment else None,
        sleep_hours_last_night=(
            packet.daily_assessment.sleep_hours_last_night if packet.daily_assessment else None
        ),
        pvt_reaction_time_ms=(
            packet.daily_assessment.pvt_reaction_time_ms if packet.daily_assessment else None
        ),
        consecutive_nights_under_6h=consecutive_under_6h,
        daily_rate_msv=packet.radiation_dosimetry.daily_rate_msv,
        spe_active=packet.radiation_dosimetry.solar_particle_event.active,
        spe_event_dose_msv=packet.radiation_dosimetry.solar_particle_event.event_dose_msv,
        mission_accumulated_msv=astronaut.mission_accumulated_msv,
        career_accumulated_msv=career_total_msv,
        rad_signal_quality=packet.radiation_dosimetry.signal_quality,
        overall_status=overall_status,
        alerts_json=alerts_serialized,
        raw_payload=packet.model_dump(mode="json"),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return EvaluatedTelemetryResponse(
        packet_id=record.packet_id,
        astronaut_id=record.astronaut_id,
        measured_at=record.measured_at,
        received_at=record.received_at,
        mission_day=record.mission_day,
        activity_state=record.activity_state,
        comm_latency_sec=record.comm_latency_sec,
        overall_status=record.overall_status,
        consecutive_nights_under_6h=record.consecutive_nights_under_6h,
        mission_accumulated_msv=record.mission_accumulated_msv,
        career_accumulated_msv=record.career_accumulated_msv,
        career_limit_msv=astronaut.career_radiation_limit_msv,
        alerts=alerts,
        telemetry=packet,
    )