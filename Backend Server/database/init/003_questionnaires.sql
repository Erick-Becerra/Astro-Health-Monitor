-- Saved questionnaires (PHQ-9 and GAD-7): the JSON the front sends, kept whole as long text,
-- plus a few columns to search by. Safe to run more than once. On a database that already exists:
--   docker compose exec -T db psql -U astro -d astro_health -v ON_ERROR_STOP=1 < database/init/003_questionnaires.sql

-- ================================================================ station
SET ROLE station_svc;

CREATE TABLE IF NOT EXISTS station.questionnaire_responses (
    id            BIGSERIAL PRIMARY KEY,
    astronaut_id  TEXT        NOT NULL,
    questionnaire TEXT        NOT NULL CHECK (questionnaire IN ('phq9', 'gad7')),
    answered_by   TEXT        NOT NULL,                  -- name of the person who answered
    score         INTEGER     NOT NULL,
    severity      TEXT        NOT NULL,                  -- as the front wrote it
    answered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    content       TEXT        NOT NULL,                  -- LONG TEXT: the JSON exactly as the front sent it
    uplinked_at   TIMESTAMPTZ,
    UNIQUE (astronaut_id, questionnaire, answered_at)
);
CREATE INDEX IF NOT EXISTS station_questionnaire_idx
    ON station.questionnaire_responses (astronaut_id, questionnaire, answered_at DESC);
CREATE INDEX IF NOT EXISTS station_questionnaire_pending_idx
    ON station.questionnaire_responses (answered_at) WHERE uplinked_at IS NULL;

RESET ROLE;

-- ================================================================== earth
SET ROLE earth_svc;

CREATE TABLE IF NOT EXISTS earth.questionnaire_responses (
    id            BIGSERIAL PRIMARY KEY,
    astronaut_id  TEXT        NOT NULL REFERENCES earth.astronauts (astronaut_id),
    questionnaire TEXT        NOT NULL CHECK (questionnaire IN ('phq9', 'gad7')),
    answered_by   TEXT        NOT NULL,
    score         INTEGER     NOT NULL,
    severity      TEXT        NOT NULL,
    answered_at   TIMESTAMPTZ NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    content       TEXT        NOT NULL,                  -- LONG TEXT: the JSON exactly as the front sent it
    UNIQUE (astronaut_id, questionnaire, answered_at)
);
CREATE INDEX IF NOT EXISTS earth_questionnaire_idx
    ON earth.questionnaire_responses (astronaut_id, questionnaire, answered_at DESC);

RESET ROLE;
