-- Clinical variables, manual captures, configuration and the change log.
-- Safe to run more than once (IF NOT EXISTS everywhere): on a database that
-- already exists, apply it with
--   docker compose exec -T db psql -U astro -d astro_health -v ON_ERROR_STOP=1 < database/init/002_clinical.sql
--
-- Each block runs AS the service role, so the tables belong to it and the
-- other service still cannot touch them.

-- ================================================================ station
SET ROLE station_svc;

-- Continuous telemetry gets more variables; every vital becomes optional
-- (blood pressure is now a manual capture, and the simulator may send partial data).
ALTER TABLE station.readings
    ALTER COLUMN heart_rate DROP NOT NULL,
    ALTER COLUMN body_temperature DROP NOT NULL,
    ALTER COLUMN blood_pressure_systolic DROP NOT NULL,
    ALTER COLUMN blood_pressure_diastolic DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS hrv_ms                 DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS sleep_hours            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pvt_b_ms               DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS spo2                   DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS respiratory_rate       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS radiation_rate_msv_day DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS radiation_dose_msv     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS cabin_co2_mmhg         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS crew_state             TEXT,
    ADD COLUMN IF NOT EXISTS mission_day            INTEGER,
    ADD COLUMN IF NOT EXISTS consecutive_nights_under_6h INTEGER,
    ADD COLUMN IF NOT EXISTS spe_active             BOOLEAN,           -- solar particle event in progress
    ADD COLUMN IF NOT EXISTS spe_event_dose_msv     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS packet_id              TEXT,              -- id of the packet sent by the simulator app
    ADD COLUMN IF NOT EXISTS meta                   JSONB;             -- sensor hardware per group, packet source

ALTER TABLE station.messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'guidance'; -- guidance, note, prescription

-- One row of mission-wide settings (mission clock, link).
CREATE TABLE IF NOT EXISTS station.mission_settings (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    mission_day          INTEGER          NOT NULL DEFAULT 0,
    link_latency_seconds DOUBLE PRECISION NOT NULL DEFAULT 3,      -- one way; Moon 2.6, Mars up to 2640
    time_scale           DOUBLE PRECISION NOT NULL DEFAULT 1,      -- speeds up radiation accumulation for demos
    link_up              BOOLEAN          NOT NULL DEFAULT TRUE,
    builtin_simulator    BOOLEAN          NOT NULL DEFAULT TRUE,
    updated_at           TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Last known value of every simulated variable per astronaut (the simulator
-- app may send only the variables it changed), plus accumulated radiation.
CREATE TABLE IF NOT EXISTS station.sim_state (
    astronaut_id      TEXT PRIMARY KEY,
    vals              JSONB            NOT NULL DEFAULT '{}',
    dose_msv          DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_frame_at     TIMESTAMPTZ,
    last_spe_at       TIMESTAMPTZ,
    last_spe_dose_msv DOUBLE PRECISION
);

-- Everything the crew types in: blood pressure, glucose, PHQ-9, GAD-7, countermeasure log.
CREATE TABLE IF NOT EXISTS station.manual_captures (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL,
    kind         TEXT        NOT NULL CHECK (kind IN ('blood_pressure', 'glucose', 'phq9', 'gad7', 'countermeasure')),
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor        TEXT,
    payload      JSONB       NOT NULL,
    uplinked_at  TIMESTAMPTZ,
    UNIQUE (astronaut_id, kind, captured_at)
);
CREATE INDEX IF NOT EXISTS station_manual_latest_idx ON station.manual_captures (astronaut_id, kind, captured_at DESC);

-- Profile, personal thresholds and exercise goals received from Earth.
CREATE TABLE IF NOT EXISTS station.astronaut_config (
    astronaut_id TEXT        NOT NULL,
    section      TEXT        NOT NULL CHECK (section IN ('profile', 'thresholds', 'exercise_goals')),
    data         JSONB       NOT NULL,
    version      INTEGER     NOT NULL,
    updated_by   TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (astronaut_id, section)
);

-- Who changed which variable, when, from what to what.
CREATE TABLE IF NOT EXISTS station.change_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    origin       TEXT        NOT NULL DEFAULT 'station',
    origin_id    BIGINT,
    astronaut_id TEXT,
    variable     TEXT        NOT NULL,
    old_value    JSONB,
    new_value    JSONB,
    actor        TEXT,
    app          TEXT,
    note         TEXT,
    uplinked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS station_change_pending_idx ON station.change_log (at) WHERE uplinked_at IS NULL;

RESET ROLE;

-- ================================================================== earth
SET ROLE earth_svc;

ALTER TABLE earth.readings
    ALTER COLUMN heart_rate DROP NOT NULL,
    ALTER COLUMN body_temperature DROP NOT NULL,
    ALTER COLUMN blood_pressure_systolic DROP NOT NULL,
    ALTER COLUMN blood_pressure_diastolic DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS hrv_ms                 DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS sleep_hours            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pvt_b_ms               DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS spo2                   DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS respiratory_rate       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS radiation_rate_msv_day DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS radiation_dose_msv     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS cabin_co2_mmhg         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS crew_state             TEXT,
    ADD COLUMN IF NOT EXISTS mission_day            INTEGER,
    ADD COLUMN IF NOT EXISTS consecutive_nights_under_6h INTEGER,
    ADD COLUMN IF NOT EXISTS spe_active             BOOLEAN,
    ADD COLUMN IF NOT EXISTS spe_event_dose_msv     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS packet_id              TEXT,
    ADD COLUMN IF NOT EXISTS meta                   JSONB,
    ADD COLUMN IF NOT EXISTS level                  TEXT;   -- green, yellow, orange, red

CREATE TABLE IF NOT EXISTS earth.manual_captures (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    kind         TEXT        NOT NULL CHECK (kind IN ('blood_pressure', 'glucose', 'phq9', 'gad7', 'countermeasure')),
    captured_at  TIMESTAMPTZ NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor        TEXT,
    payload      JSONB       NOT NULL,
    level        TEXT,
    UNIQUE (astronaut_id, kind, captured_at)
);
CREATE INDEX IF NOT EXISTS earth_manual_latest_idx ON earth.manual_captures (astronaut_id, kind, captured_at DESC);

-- Every change of semaphore colour (green, yellow, orange, red), with the reason.
CREATE TABLE IF NOT EXISTS earth.level_history (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    at           TIMESTAMPTZ NOT NULL,
    level        TEXT        NOT NULL,
    status       TEXT        NOT NULL,
    reasons      JSONB       NOT NULL DEFAULT '[]',
    UNIQUE (astronaut_id, at)
);

CREATE TABLE IF NOT EXISTS earth.astronaut_config (
    astronaut_id TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    section      TEXT        NOT NULL CHECK (section IN ('profile', 'thresholds', 'exercise_goals')),
    data         JSONB       NOT NULL,
    version      INTEGER     NOT NULL DEFAULT 1,
    updated_by   TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (astronaut_id, section)
);

-- Messages and configuration waiting to travel to the station. deliver_at
-- holds them back for the link latency.
CREATE TABLE IF NOT EXISTS earth.outbox (
    id           BIGSERIAL PRIMARY KEY,
    astronaut_id TEXT        NOT NULL,
    kind         TEXT        NOT NULL CHECK (kind IN ('config', 'message')),
    payload      JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deliver_at   TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    attempts     INTEGER     NOT NULL DEFAULT 0,
    last_error   TEXT
);
CREATE INDEX IF NOT EXISTS earth_outbox_due_idx ON earth.outbox (deliver_at) WHERE delivered_at IS NULL;

-- Earth's own changes, plus the station's changes once they arrive.
CREATE TABLE IF NOT EXISTS earth.change_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    origin       TEXT        NOT NULL DEFAULT 'earth',     -- earth or station
    origin_id    BIGINT,                                   -- id on the station, for rows that came from it
    astronaut_id TEXT,
    variable     TEXT        NOT NULL,
    old_value    JSONB,
    new_value    JSONB,
    actor        TEXT,
    app          TEXT,
    note         TEXT,
    UNIQUE (origin, origin_id)
);
CREATE INDEX IF NOT EXISTS earth_change_at_idx ON earth.change_log (at DESC);

RESET ROLE;
