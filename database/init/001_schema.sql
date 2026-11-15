-- Database schema. Owner: backend/database lead.
-- This script runs automatically the FIRST time the database is created.
-- To run it again after changing it, reset the database:
--   docker compose down -v
--   docker compose up --build
--
-- One PostgreSQL server, two isolated schemas, one role per service:
--   station.*  owned by role station_svc  (space-station container, "on board" data)
--   earth.*    owned by role earth_svc    (earth-base container, "mission control" data)
-- Each service can only touch its own schema. The two services share data
-- only through HTTP, exactly as a real station and ground segment would.
-- Passwords below are for local development only.

-- ---------------------------------------------------------------- roles
CREATE ROLE station_svc LOGIN PASSWORD 'station';
CREATE ROLE earth_svc   LOGIN PASSWORD 'earth';

CREATE SCHEMA station AUTHORIZATION station_svc;
CREATE SCHEMA earth   AUTHORIZATION earth_svc;

ALTER ROLE station_svc SET search_path = station;
ALTER ROLE earth_svc   SET search_path = earth;

-- ------------------------------------------------------- station schema
-- Everything the station measures is stored here first (store-and-forward).
-- A row stays with uplinked_at = NULL until Earth confirms it received it,
-- so nothing is lost during a communication blackout.
CREATE TABLE station.readings (
    id                       BIGSERIAL PRIMARY KEY,
    astronaut_id             TEXT             NOT NULL,
    measured_at              TIMESTAMPTZ      NOT NULL,
    heart_rate               DOUBLE PRECISION NOT NULL,   -- bpm
    body_temperature         DOUBLE PRECISION NOT NULL,   -- degrees Celsius
    blood_pressure_systolic  DOUBLE PRECISION NOT NULL,   -- mmHg
    blood_pressure_diastolic DOUBLE PRECISION NOT NULL,   -- mmHg
    source                   TEXT             NOT NULL DEFAULT 'simulator',  -- 'simulator' or 'sensor'
    uplinked_at              TIMESTAMPTZ,
    UNIQUE (astronaut_id, measured_at)
);
CREATE INDEX station_readings_pending_idx
    ON station.readings (measured_at) WHERE uplinked_at IS NULL;

-- Guidance sent from Earth to the crew.
CREATE TABLE station.messages (
    id           BIGSERIAL PRIMARY KEY,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    astronaut_id TEXT,                                     -- NULL = whole crew
    severity     TEXT        NOT NULL DEFAULT 'info',      -- info, attention, critical
    body         TEXT        NOT NULL,
    acknowledged BOOLEAN     NOT NULL DEFAULT FALSE
);

-- --------------------------------------------------------- earth schema
CREATE TABLE earth.astronauts (
    astronaut_id TEXT        PRIMARY KEY,
    name         TEXT,
    gender       TEXT CHECK (gender IN ('female', 'male', 'other')),  -- profile data, set with PUT /api/astronauts/{id}
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE earth.readings (
    id                       BIGSERIAL PRIMARY KEY,
    astronaut_id             TEXT             NOT NULL REFERENCES earth.astronauts (astronaut_id),
    measured_at              TIMESTAMPTZ      NOT NULL,   -- when the station measured it
    received_at              TIMESTAMPTZ      NOT NULL DEFAULT now(),  -- when Earth got it
    heart_rate               DOUBLE PRECISION NOT NULL,
    body_temperature         DOUBLE PRECISION NOT NULL,
    blood_pressure_systolic  DOUBLE PRECISION NOT NULL,
    blood_pressure_diastolic DOUBLE PRECISION NOT NULL,
    status                   TEXT             NOT NULL,   -- ok, attention, critical
    UNIQUE (astronaut_id, measured_at)                    -- makes re-sent data harmless
);
CREATE INDEX earth_readings_latest_idx ON earth.readings (astronaut_id, measured_at DESC);

CREATE TABLE earth.alerts (
    id                 BIGSERIAL PRIMARY KEY,
    astronaut_id       TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    reading_id         BIGINT      REFERENCES earth.readings (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity           TEXT        NOT NULL,              -- attention, critical
    summary            TEXT        NOT NULL,
    guidance           TEXT        NOT NULL,
    sent_to_station_at TIMESTAMPTZ                        -- NULL until the station got the message
);
CREATE INDEX earth_alerts_unsent_idx ON earth.alerts (id) WHERE sent_to_station_at IS NULL;

-- Tables above are created by the superuser, so hand each one to its service.
ALTER TABLE station.readings OWNER TO station_svc;
ALTER TABLE station.messages OWNER TO station_svc;
ALTER TABLE earth.astronauts OWNER TO earth_svc;
ALTER TABLE earth.readings   OWNER TO earth_svc;
ALTER TABLE earth.alerts     OWNER TO earth_svc;
ALTER SEQUENCE station.readings_id_seq OWNER TO station_svc;
ALTER SEQUENCE station.messages_id_seq OWNER TO station_svc;
ALTER SEQUENCE earth.readings_id_seq   OWNER TO earth_svc;
ALTER SEQUENCE earth.alerts_id_seq     OWNER TO earth_svc;

-- Nobody else may read or write these schemas.
REVOKE ALL ON SCHEMA station FROM PUBLIC;
REVOKE ALL ON SCHEMA earth   FROM PUBLIC;
