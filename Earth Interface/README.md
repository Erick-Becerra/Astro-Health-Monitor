# Earth Interface

The ground-control app of Astro Health Monitor, for a flight surgeon or a mission-control operator: the list of
astronauts, the telemetry as a live log, the symptoms reported from the station, astronaut records, and printable
health reports for any date range.

It talks **only to the Earth base** of the Backend Server (`:8000`). What the station measures reaches Earth after the
link delay, so Earth always lags a little behind the station.

## Run it

1. Copy `.env.example` to `.env` and set the address of the backend machine:

   ```
   EARTH_URL=http://<BACKEND_IP>:8000
   ```

2. Start it:

   ```
   docker compose up --build
   ```

3. Open http://localhost:5173/earth (the printable report is at `/earth/report`).

Without Docker, work inside `frontend/`: create `frontend/.env` with `VITE_EARTH_URL`, then `npm install` and
`npm run dev`. Vite reads `.env` only when it starts, so restart it after any change.

Mock mode (`VITE_USE_MOCKS=true`) reads `frontend/public/mocks` instead of calling a server, which lets you work with
no backend.

## Configuration

| Variable in `.env` | Passed to the app as | Meaning |
|---|---|---|
| `EARTH_URL` | `VITE_EARTH_URL` | Earth base server (default `http://localhost:8000`) |
| `STATION_URL` | `VITE_STATION_URL` | Read by the shared client; this app does not call the station |
| `ACTOR` | `VITE_ACTOR` | Name sent with every write for the change log |

## Documentation

The full guide of the app (structure, features, API calls, data formats, styling, troubleshooting) is
[frontend/src/earth/README.md](frontend/src/earth/README.md).

This folder is one of the four projects of the repository; see the [root README](../README.md) for how they connect.
