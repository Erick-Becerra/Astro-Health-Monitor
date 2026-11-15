-- Removes the demo data created by backend/seed_apps_demo.py (astronauts AST-01 to AST-03 and what hangs
-- from them), so the seed can be run again. It does not touch A001 to A003 (the built-in demo simulator).
--
--   docker compose exec -T db psql -U astro -d astro_health < database/demo/reset_apps_demo.sql
--   docker compose exec -T space-station python seed_apps_demo.py
--
-- Run as the database owner (the "astro" user): it reaches into both schemas.
DELETE FROM earth.symptom_reports WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.astronaut_records WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.alerts          WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.level_history   WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.manual_captures WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.questionnaire_responses WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.readings        WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.astronaut_config WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.outbox          WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM earth.change_log      WHERE astronaut_id LIKE 'AST-0%' OR actor IN ('seed_apps_demo', 'Dr. Rivera (demo)', 'crew (demo)');
DELETE FROM earth.astronauts      WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.symptom_reports WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.manual_captures WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.questionnaire_responses WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.readings      WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.messages      WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.sim_state     WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.astronaut_config WHERE astronaut_id LIKE 'AST-0%';
DELETE FROM station.change_log    WHERE astronaut_id LIKE 'AST-0%' OR actor IN ('seed_apps_demo', 'Dr. Rivera (demo)', 'crew (demo)');
