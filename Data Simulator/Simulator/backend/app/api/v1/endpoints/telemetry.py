from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.astronaut import Astronaut
from app.models.telemetry import TelemetryRecord
from app.schemas.telemetry_v1_1 import EvaluatedTelemetryResponse, TelemetryPacketV1_1
from app.services.telemetry_ingestor import ingest_telemetry_packet

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


def _to_response(record: TelemetryRecord, career_limit: float) -> EvaluatedTelemetryResponse:
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
        career_limit_msv=career_limit,
        alerts=record.alerts_json,
        telemetry=TelemetryPacketV1_1.model_validate(record.raw_payload),
    )


@router.post("", response_model=EvaluatedTelemetryResponse, status_code=201)
def post_telemetry(packet: TelemetryPacketV1_1, db: Session = Depends(get_db)):
    """Ingests a telemetry-v1.1 packet from the ESP32 / Sensor Simulator."""
    return ingest_telemetry_packet(db, packet)


@router.get("/latest", response_model=list[EvaluatedTelemetryResponse])
def get_all_latest_telemetry(db: Session = Depends(get_db)):
    """Returns the latest evaluated telemetry packet for every active astronaut."""
    astronauts = db.query(Astronaut).all()
    results: list[EvaluatedTelemetryResponse] = []
    for astro in astronauts:
        latest = (
            db.query(TelemetryRecord)
            .filter(TelemetryRecord.astronaut_id == astro.astronaut_id)
            .order_by(desc(TelemetryRecord.measured_at))
            .first()
        )
        if latest:
            results.append(_to_response(latest, astro.career_radiation_limit_msv))
    return results


@router.get("/latest/{astronaut_id}", response_model=EvaluatedTelemetryResponse)
def get_astronaut_latest_telemetry(astronaut_id: str, db: Session = Depends(get_db)):
    """Returns the latest evaluated telemetry packet for a specific astronaut."""
    astro = db.query(Astronaut).filter(Astronaut.astronaut_id == astronaut_id).first()
    if not astro:
        raise HTTPException(status_code=404, detail=f"Astronaut '{astronaut_id}' not found.")

    latest = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.astronaut_id == astronaut_id)
        .order_by(desc(TelemetryRecord.measured_at))
        .first()
    )
    if not latest:
        raise HTTPException(status_code=404, detail=f"No telemetry recorded yet for '{astronaut_id}'.")

    return _to_response(latest, astro.career_radiation_limit_msv)


@router.get("/history/{astronaut_id}", response_model=list[EvaluatedTelemetryResponse])
def get_astronaut_telemetry_history(
    astronaut_id: str,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Returns chronological time-series telemetry for Earth Mission Control charts."""
    astro = db.query(Astronaut).filter(Astronaut.astronaut_id == astronaut_id).first()
    if not astro:
        raise HTTPException(status_code=404, detail=f"Astronaut '{astronaut_id}' not found.")

    records = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.astronaut_id == astronaut_id)
        .order_by(desc(TelemetryRecord.measured_at))
        .limit(limit)
        .all()
    )
    return [_to_response(r, astro.career_radiation_limit_msv) for r in reversed(records)]