from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, Integer, String
from app.core.database import Base


class Astronaut(Base):
    __tablename__ = "astronauts"

    astronaut_id = Column(String(16), primary_key=True, index=True)  # e.g., AST-01
    full_name = Column(String(120), nullable=False)
    agency = Column(String(32), default="NASA", nullable=False)  # NASA | CSA | ESA
    career_radiation_limit_msv = Column(Float, default=600.0, nullable=False)
    prior_radiation_msv = Column(Float, default=0.0, nullable=False)
    mission_accumulated_msv = Column(Float, default=0.0, nullable=False)
    baseline_hr_bpm = Column(Integer, default=68, nullable=False)
    baseline_sbp_mmhg = Column(Integer, default=116, nullable=False)
    baseline_dbp_mmhg = Column(Integer, default=75, nullable=False)
    mission_started_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )