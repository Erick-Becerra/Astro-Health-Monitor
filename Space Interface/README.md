# Space Interface

The interface with the body diagram, the vital signs and the alerts of each astronaut, the wellbeing questionnaires
(PHQ-9 and GAD-7) and the symptom reports. The whole interface is available in Spanish and English from its settings
button, and it adapts its size to any screen.

It reads the **Earth base** (`:8000`) for astronauts, dashboards and alerts, and writes questionnaires and symptom
reports to the **space station** (`:8001`), both in the Backend Server.

## Run it

1. Copy `.env.example` to `.env` and set the address of the backend machine:

   ```
   EARTH_URL=http://<BACKEND_IP>:8000
   STATION_URL=http://<BACKEND_IP>:8001
   ```

2. Start it:

   ```
   docker compose up --build
   ```

3. Open http://localhost:5173/earth.

Without Docker, work inside `frontend/`: create `frontend/.env` with `VITE_EARTH_URL` and `VITE_STATION_URL`, then
`npm install` and `npm run dev`. Vite reads `.env` only when it starts, so restart it after any change.

## Configuration

| Variable in `.env` | Passed to the app as | Meaning |
|---|---|---|
| `EARTH_URL` | `VITE_EARTH_URL` | Earth base server (default `http://localhost:8000`) |
| `STATION_URL` | `VITE_STATION_URL` | Space station server (default `http://localhost:8001`) |
| `ACTOR` | `VITE_ACTOR` | Name sent with every write for the change log |

## Documentation

- [frontend/README.md](frontend/README.md): running, configuration and folder map of the app.
- [docs/earth-interface.md](docs/earth-interface.md): what each part of the screen does.
- [docs/frontend-architecture.md](docs/frontend-architecture.md): code organisation and how to extend it.
- [docs/api-usage.md](docs/api-usage.md): the endpoints it calls and the payloads it sends.
- [docs/i18n.md](docs/i18n.md): languages and how to add texts.

This folder is one of the four projects of the repository; see the [root README](../README.md) for how they connect.
