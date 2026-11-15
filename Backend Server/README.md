# Backend Server

The core of the platform. It runs on the **host machine** and serves everyone else over the network.

| Service | Port | Role |
|---|---|---|
| `space-station` | 8001 | Receives the packets of the Data Simulator, evaluates them, stores them on board, and accepts questionnaires and symptom reports |
| `earth-base` | 8000 | Keeps the history, raises alerts, serves the dashboards and sends guidance back to the station |
| `db` | 5432 (host only) | PostgreSQL 16 with one schema for Earth and one for the station |

Both services come from the same image, built from `backend/`; only the start command changes. The station also has
a built-in simulator (`SIM_ASTRONAUTS`) so the system shows data even when no external simulator is connected.

## Run it

```
docker compose up --build
```

- Earth base documentation: http://localhost:8000/docs
- Space station documentation: http://localhost:8001/docs
- Health checks: `/api/health` on both ports.

Everything has a default value, so no `.env` file is needed to start. To change a setting, copy `.env.example` to
`.env`. It holds the database credentials and `HOST_IP`; the compose file also reads `SIM_ASTRONAUTS`,
`SIM_INTERVAL_SECONDS`, `LINK_DELAY_SECONDS` (the one-way delay between the station and Earth) and `UPLINK_MODE` (`db`:
Earth reads the station tables; `http`: the station posts to Earth) from the same file.

## Letting other machines connect

Other machines need to reach ports 8000 and 8001. On Windows, run in PowerShell as Administrator:

```
powershell -ExecutionPolicy Bypass -File scripts\share-on-lan.ps1
```

It opens the ports for the local subnet only. The database is not exposed on purpose. More details are in
[docs/lan.md](docs/lan.md).

The APIs accept browsers from `localhost` and from private network addresses on any port, so the interfaces can run on
other machines without changes. To allow other origins, set `CORS_ORIGINS` or `CORS_ORIGIN_REGEX` in the compose file.

## Who calls it

| Caller | Port | Calls |
|---|---|---|
| Data Simulator | 8001 | `POST /api/sim/packet` |
| Space Interface | 8001 | `GET/POST /api/crew/{id}/questionnaires`, `POST /api/crew/{id}/symptom-report` |
| Earth Interface, Space Interface | 8000 | `/api/astronauts`, `/api/astronauts/{id}/dashboard`, `/api/alerts` and more |

## Documentation

The `docs/` folder has the architecture, the contracts of each app, the data format, the simulator connection guide,
mocks of every endpoint and the working-on-a-network guide. Start with [docs/README.md](docs/README.md).

## Layout

| Path | Content |
|---|---|
| `backend/` | The two FastAPI services and the code they share |
| `database/init/` | SQL that creates the schemas the first time the database starts |
| `docs/` | Documentation, mocks and the frontend kits |
| `scripts/` | Helper scripts (network sharing, mock export) |
| `docker-compose.yml` | Starts the database and both services |

If the database schema changes, remove its volume so the init scripts run again: `docker compose down -v` deletes the
stored data.
