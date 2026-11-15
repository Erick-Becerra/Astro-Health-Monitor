-- One more derived reading value for the sleep rules of the indicators document:
-- nights in a row under 4 hours (the station counts them from the daily assessments).
-- Safe to run more than once. On a database that already exists:
--   docker compose exec -T db psql -U astro -d astro_health -v ON_ERROR_STOP=1 < database/init/004_indicator_rules.sql

SET ROLE station_svc;
ALTER TABLE station.readings ADD COLUMN IF NOT EXISTS consecutive_nights_under_4h INTEGER;
RESET ROLE;

SET ROLE earth_svc;
ALTER TABLE earth.readings ADD COLUMN IF NOT EXISTS consecutive_nights_under_4h INTEGER;
RESET ROLE;
