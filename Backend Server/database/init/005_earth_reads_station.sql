-- Earth reads what the station stored, straight from the database (no HTTP uplink).
-- Idempotent. Apply to a live DB:  docker compose exec -T db psql -U astro -d astro_health < database/init/005_earth_reads_station.sql
GRANT USAGE ON SCHEMA station TO earth_svc;
GRANT SELECT ON station.readings, station.manual_captures, station.questionnaire_responses,
               station.change_log, station.mission_settings TO earth_svc;
-- Earth only marks what it has already taken (uplinked_at), it changes nothing else of the station.
GRANT UPDATE (uplinked_at) ON station.readings, station.manual_captures,
                              station.questionnaire_responses, station.change_log TO earth_svc;
