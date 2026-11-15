# Architecture

Two backend services simulate the two ends of a real mission. They run in two
containers built from **one Docker image** (`backend/Dockerfile`), so everyone
gets the same environment.

```
 ESP32 (optional)        space-station :8001                    earth-base :8000        frontend :5173
 real sensor  ──POST──►  simulator + local storage  ──uplink──► analysis + alerts  ◄──── REST ──── web app
                         (schema station)          ◄──guidance── (schema earth)
                                   └───────────── db (PostgreSQL 16) ─────────────┘
```

## Services

| | space-station | earth-base |
|---|---|---|
| Folder | `backend/space_station/` | `backend/earth_base/` |
| Port | 8001 | 8000 |
| Role | Produces readings (simulator or ESP32), stores them on board, sends them to Earth | Receives, analyses, stores, raises alerts, serves the frontend |
| Database schema / user | `station` / `station_svc` | `earth` / `earth_svc` |
| API docs | http://localhost:8001/docs | http://localhost:8000/docs |

Shared code lives in `backend/shared/` (data format, status rules, settings).

The two services never touch each other's tables (each database user can only
see its own schema). They only talk over HTTP:

1. **Uplink**: the station sends `POST /api/telemetry` to Earth.
2. **Guidance**: Earth sends `POST /api/messages` to the station.

## Why store-and-forward

Every reading is saved on the station first and marked as sent only when Earth
confirms it. If the link is down (a blackout, or Earth is stopped), nothing is
lost: the station keeps the data and sends it when the link returns. Earth
ignores readings it already has, so re-sending is safe. Alerts that Earth could
not deliver to the station are retried the same way.

## Try it

| Do this | Command |
|---|---|
| Make a fever appear on A002 for 2 minutes | `curl -X POST localhost:8001/api/scenarios -H "content-type: application/json" -d '{"astronaut_id":"A002","scenario":"fever","seconds":120}'` |
| Cut the link (blackout) | `curl -X POST localhost:8001/api/link -H "content-type: application/json" -d '{"up":false}'` |
| Restore the link | `curl -X POST localhost:8001/api/link -H "content-type: application/json" -d '{"up":true}'` |
| See what is waiting to be sent | `curl localhost:8001/api/status` |
| See alerts on Earth | `curl localhost:8000/api/alerts` |
| See guidance received on the station | `curl localhost:8001/api/messages` |

Scenarios: `fever`, `tachycardia`, `hypertension`, `hypothermia`, `solar_storm`.
Remove them with `DELETE /api/scenarios`.

## Demo history

`backend/seed_demo.py` loads 6 hours of history with fevers, tachycardia and
so on straight into Earth (`POST /api/telemetry?backfill=true`, which dates the
alerts at the reading time and does not send them to the station):

```
docker compose exec -T earth-base python seed_demo.py
```

Run it once after creating the database. It only adds data when it has not been
loaded yet. The station does not hold this history: it only exists on Earth.

## Settings (all optional)

Set them in a `.env` file next to `docker-compose.yml`.

| Variable | Default | Meaning |
|---|---|---|
| `SIM_ASTRONAUTS` | `A001,A002,A003` | Simulated crew |
| `SIM_INTERVAL_SECONDS` | `2` | Seconds between readings |
| `LINK_DELAY_SECONDS` | `3` | One-way delay to Earth. Real Mars delay is 180 to 1320 |

## Known limits

- Status thresholds follow the "Health Indicators Structure (Telemetry v1.1)" document and live in
  `backend/shared/indicators.py` (listed in `docs/indicators.md`). Gaps the document leaves open are marked as
  assumptions in the code comments and need clinical confirmation.
- The link delay applies to the uplink only. Guidance from Earth arrives immediately.
- Passwords in `database/init/001_schema.sql` are for local development only.

## How Earth gets the station's data (UPLINK_MODE)
- `db` (default): the station stores every reading, capture, questionnaire and change in its tables (`station.*`).
  Earth reads them itself from the shared database (`backend/earth_base/pull.py`, every 0.5 s, role `earth_svc`
  with read access to the station tables, see `database/init/005_earth_reads_station.sql`) and runs them through
  the same ingest as `/api/sync`. The station sends nothing and Earth keeps serving what it has read even if the
  station service is stopped. The mission switch `link_up = false` still stops Earth from reading; the link latency no
  longer delays the data.
- `http`: the old store-and-forward uplink (`POST /api/sync` with the link latency). Set `UPLINK_MODE=http`.
- Earth -> station (rules, guidance) still travels over HTTP through Earth's outbox.
- Both modes need the database on this computer: if it is off, neither service works.
