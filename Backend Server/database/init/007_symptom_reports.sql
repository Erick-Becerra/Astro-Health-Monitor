-- Symptom reports: the astronaut says "something hurts" / "I feel unwell" from the station console.
-- The station keeps the report (with the vitals of that moment); Earth takes it and raises an alert.
-- Safe to run more than once. On a live database:
--   docker compose exec -T db psql -U astro -d astro_health -v ON_ERROR_STOP=1 < database/init/007_symptom_reports.sql

-- ================================================================ station
SET ROLE station_svc;

CREATE TABLE IF NOT EXISTS station.symptom_reports (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL,
    reported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    symptom      TEXT        NOT NULL,
    severity     TEXT        NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
    body_area    TEXT,
    description  TEXT,                                   -- LONG TEXT, free
    reported_by  TEXT        NOT NULL,
    vitals       JSONB,                                  -- latest reading at the moment of the report
    uplinked_at  TIMESTAMPTZ,
    UNIQUE (astronaut_id, reported_at, symptom)
);
CREATE INDEX IF NOT EXISTS station_symptoms_idx ON station.symptom_reports (astronaut_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS station_symptoms_pending_idx ON station.symptom_reports (reported_at) WHERE uplinked_at IS NULL;

RESET ROLE;

-- ================================================================== earth
SET ROLE earth_svc;

CREATE TABLE IF NOT EXISTS earth.symptom_reports (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    reported_at  TIMESTAMPTZ NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    symptom      TEXT        NOT NULL,
    severity     TEXT        NOT NULL,
    body_area    TEXT,
    description  TEXT,
    reported_by  TEXT        NOT NULL,
    vitals       JSONB,
    UNIQUE (astronaut_id, reported_at, symptom)
);
CREATE INDEX IF NOT EXISTS earth_symptoms_idx ON earth.symptom_reports (astronaut_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS earth_symptoms_all_idx ON earth.symptom_reports (reported_at DESC);

RESET ROLE;

-- Earth reads the station's table straight from the database (see 005_earth_reads_station.sql).
GRANT SELECT ON station.symptom_reports TO earth_svc;
GRANT UPDATE (uplinked_at) ON station.symptom_reports TO earth_svc;
