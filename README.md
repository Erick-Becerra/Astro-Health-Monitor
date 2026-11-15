# Astro Health Monitor

NASA Space Apps 2026: Health Monitoring Software for Astronauts on Space Missions.

A web platform where astronauts' health indicators are collected, analysed and
shown in a clear visual interface, with guidance on what to do when something
looks wrong.

## How it works

1. The **space station** service produces vital signs (built-in simulator, or a real **ESP32** sending over Wi-Fi) and stores them on board.
2. It sends them to the **Earth base** service, which analyses them, stores them in the database, raises alerts and sends guidance back to the station.
3. The **frontend** shows every registered astronaut and, for each one, a 3D body with the status of each area.

Both services run from one Docker image. See [docs/architecture.md](docs/architecture.md).
The three apps (Earth monitoring, astronaut console, sensor simulator) and what each one
reads and writes are in [docs/apps-contract.md](docs/apps-contract.md). The backend decides the
colour of every indicator; the frontend only paints it. JSON mocks of every endpoint, to build the
screens without the backend, are in [docs/mocks](docs/mocks/README.md). To connect the sensor simulator (what to send, where, examples in curl, Python and JavaScript) see
[docs/simulator/README.md](docs/simulator/README.md). The kit for the front team (two packs,
Station and Earth, each with a prompt for the team's assistant) is in [docs/frontend](docs/frontend/README.md).

## Tech stack

| Part | Technology | Folder |
|---|---|---|
| Frontend | React + Vite + Three.js | `frontend/` |
| Backend (2 services: Earth base, space station) | Python + FastAPI | `backend/` |
| Database | PostgreSQL 16 | `database/` |
| Simulator | ESP32 (Arduino IDE or PlatformIO) | `firmware/` |
| Documentation | Markdown | `docs/` |

Frontend, backend and database run in three Docker containers (see `docker-compose.yml`).

## Quick start

See [SETUP.md](SETUP.md) for the full step-by-step guide. The short version:

```
git clone https://github.com/Erick-Becerra/Astro-Health-Monitor.git
cd Astro-Health-Monitor
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Earth base API documentation: http://localhost:8000/docs
- Space station API documentation: http://localhost:8001/docs

## Sharing one computer with the team

One person runs Docker and the rest connect over the local network.
See [docs/lan.md](docs/lan.md). The person building the frontend only needs
[docs/api-for-frontend.md](docs/api-for-frontend.md).

## Working as a team

See [CONTRIBUTING.md](CONTRIBUTING.md).
