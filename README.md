# Astro Health Monitor

NASA Space Apps 2026: Health Monitoring Software for Astronauts on Space Missions.

A web platform where astronauts' health indicators are collected, analysed and
shown in a clear visual interface, with guidance on what to do when something
looks wrong.

## How it works

1. An **ESP32** simulates an astronaut's vital signs and sends them over Wi-Fi.
2. The **backend** receives them, analyses them and stores them in the database.
3. The **frontend** shows every registered astronaut and, for each one, a 3D body with the status of each area.

## Tech stack

| Part | Technology | Folder |
|---|---|---|
| Frontend | React + Vite + Three.js | `frontend/` |
| Backend | Python + FastAPI | `backend/` |
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
- API documentation: http://localhost:8000/docs

## Working as a team

See [CONTRIBUTING.md](CONTRIBUTING.md).
