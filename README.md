# Astro Health Monitor

NASA Space Apps 2026: health monitoring software for astronauts on space missions.

The platform collects the vital signs of astronauts, analyses them, shows their status in clear interfaces and gives
guidance on what to do when something looks wrong.

This repository holds **four independent projects**. Each one lives in its own folder and is meant to run on its own
machine; they talk to each other over the network (Wi-Fi, a router or a phone hotspot). Everything is stored in one
repository so the team keeps a single history.

| Folder | What it is | Technology | Runs where | Port |
|---|---|---|---|---|
| [`Backend Server/`](Backend%20Server/README.md) | Space station and Earth base APIs, clinical analysis and the database | Python, FastAPI, PostgreSQL, Docker | The **host** machine | 8000, 8001, 5432 |
| [`Data Simulator/`](Data%20Simulator/README.md) | Sensor telemetry simulator that sends vital signs to the station, and the ESP32 thermometer | Browser app (no build), ESP32 | A laptop with the sensors | 5500 |
| [`Earth Interface/`](Earth%20Interface/README.md) | Ground-control app for the medical team and mission control | React, Vite | Any machine | 5173 |
| [`Space Interface/`](Space%20Interface/README.md) | Interface with the body diagram, vital signs, alerts, wellbeing questionnaires and symptom reports, in Spanish and English | React, Vite | Any machine | 5173 |

## How the four parts talk to each other

```
                       Data Simulator                     (browser, sensors, ESP32)
                             |
                             |  POST /api/sim/packet     telemetry-v1.1 packets
                             v
  Space Interface -----> Backend Server: space station :8001 --- database --- Earth base :8000 <----- Earth Interface
  (questionnaires and      ^                                                       ^
   symptom reports)        |                                                       |
                           +---- reads dashboards and alerts from Earth :8000 -----+
                                                  (Space Interface)
```

1. The **Data Simulator** measures (real watch and thermocouple, plus synthetic controls) and sends a packet to the
   **space station** service of the Backend Server.
2. The station stores it and evaluates it. The Earth base receives the same data after the link delay and keeps the
   history, the alerts and the guidance.
3. The **Earth Interface** reads only the Earth base (`:8000`).
4. The **Space Interface** reads the Earth base (`:8000`) and writes questionnaires and symptom reports to the station
   (`:8001`).

The backend decides the colour of every indicator (green, yellow, orange, red). The interfaces only paint it.

## Running the four parts on different machines

1. **Backend Server** (host machine). Start it first, then note its IP address:

   ```
   cd "Backend Server"
   docker compose up --build
   ```

   Open `http://localhost:8000/docs` and `http://localhost:8001/docs` to check it. If other machines must reach it,
   open the ports in the firewall (`Backend Server/scripts/share-on-lan.ps1` does it on Windows).
2. **Data Simulator** (laptop with the sensors). Serve the folder and open it in Chrome or Edge, then type the station
   address `http://<BACKEND_IP>:8001/api/sim/packet`:

   ```
   cd "Data Simulator"
   python -m http.server 5500
   ```

   Open `http://localhost:5500/Simulator/emitter/`.
3. **Earth Interface** (any machine). Copy `.env.example` to `.env`, set `EARTH_URL=http://<BACKEND_IP>:8000`, then:

   ```
   cd "Earth Interface"
   docker compose up --build
   ```

   Open `http://localhost:5173/earth`.
4. **Space Interface** (any machine). Copy `.env.example` to `.env`, set `EARTH_URL=http://<BACKEND_IP>:8000` and
   `STATION_URL=http://<BACKEND_IP>:8001`, then:

   ```
   cd "Space Interface"
   docker compose up --build
   ```

   Open `http://localhost:5173/earth`.

Both interfaces use port 5173, so on a single machine run only one at a time, or change the port in its
`docker-compose.yml`.

## Addresses and ports

| What | Address | Used by |
|---|---|---|
| Earth base API | `http://<BACKEND_IP>:8000` | Earth Interface, Space Interface |
| Space station API | `http://<BACKEND_IP>:8001` | Data Simulator, Space Interface |
| Database | `localhost:5432` on the host only | Backend Server |
| Earth Interface | `http://localhost:5173/earth` | the person using it |
| Space Interface | `http://localhost:5173/earth` | the person using it |
| Data Simulator | `http://localhost:5500/Simulator/emitter/` | the person using it |

All machines must be on the same network. The address of the backend changes when a phone hotspot restarts: update the
`.env` of each interface and the endpoint box of the simulator, then restart the interfaces
(`docker compose restart`). The backend accepts browsers from private network addresses on any port, so the
interfaces can run on other machines without changing its configuration.

## Repository layout

```
Astro-Health-Monitor/
  Backend Server/    backend/, database/, docs/, scripts/, docker-compose.yml
  Data Simulator/    Simulator/ (browser app), ESP32/ (firmware and its guide)
  Earth Interface/   frontend/ (React app), docker-compose.yml
  Space Interface/   frontend/ (React app), docs/, docker-compose.yml
  CONTRIBUTING.md    how the team works
```

Every folder has its own README with the details of that project.

## Where each folder came from

The four folders were assembled from the work branches of the project. The branches are kept in the repository.

| Folder | Source branch |
|---|---|
| `Space Interface/` | `feature/merged-UIs` |
| `Backend Server/` | `backend` |
| `Data Simulator/` | `shai` |
| `Earth Interface/` | `feature/ground-frontend` |

## Working as a team

See [CONTRIBUTING.md](CONTRIBUTING.md).
