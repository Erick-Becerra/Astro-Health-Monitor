-- Astronaut record files (CSV) uploaded from Earth. They live ONLY on Earth: the station never gets them.
-- Every upload is a new version; nothing is overwritten. Safe to run more than once. On a live database:
--   docker compose exec -T db psql -U astro -d astro_health -v ON_ERROR_STOP=1 < database/init/006_astronaut_records.sql
SET ROLE earth_svc;

CREATE TABLE IF NOT EXISTS earth.astronaut_records (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    filename     TEXT        NOT NULL,
    size_bytes   INTEGER     NOT NULL,
    delimiter    TEXT        NOT NULL DEFAULT ',',
    columns      JSONB       NOT NULL,                 -- header row
    row_count    INTEGER     NOT NULL,                 -- data rows (header not counted)
    content      BYTEA       NOT NULL,                 -- the file exactly as uploaded
    note         TEXT,
    uploaded_by  TEXT        NOT NULL,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS earth_records_astronaut_idx ON earth.astronaut_records (astronaut_id, uploaded_at DESC);
RESET ROLE;
