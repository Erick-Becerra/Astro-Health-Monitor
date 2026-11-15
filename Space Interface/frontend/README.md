# Frontend

React 19 + Vite application. The main screen is the **Earth monitoring interface** at `/earth`: a mission-control view
where the medical team follows every astronaut, sees the status of each body system and receives alerts.

Any other address redirects to `/earth`. The older pages (`pages/Home.jsx`, `pages/AstronautDetail.jsx`) and the 3D
component (`components/BodyPointCloud.jsx`) are kept in the repository but are not routed.

## Run it

The recommended way is Docker, from the `Space Interface` folder (see [../README.md](../README.md)):

```
docker compose up --build
```

Open http://localhost:5173/earth.

To run it without Docker: `npm install` and `npm run dev` inside this folder. The container mounts `./frontend` over
`/app`, so edits on disk reload the page. After changing `package.json` or switching to a branch with different
dependencies, rebuild the image and renew the anonymous `node_modules` volume:

```
docker compose build frontend
docker compose up -d --renew-anon-volumes frontend
```

Never run `docker compose down -v`: it also deletes the database volume.

## Configuration

Create `frontend/.env` (ignored by git). Vite reads it when the dev server starts, so restart the container after
changing it (`docker compose restart frontend`).

| Variable | Default | Meaning |
|---|---|---|
| `VITE_EARTH_URL` | `http://localhost:8000` | Earth base server |
| `VITE_STATION_URL` | `http://localhost:8001` | Space station server |
| `VITE_ACTOR` | `frontend` | Name sent in the `X-Actor` header of every write, for the change log |
| `VITE_USE_MOCKS` | `false` | `true` reads the JSON files of `public/mocks` instead of calling the servers |

The addresses change when the hotspot restarts, which is why they live in `.env` and never in the code.

## Folder map

| Path | What it holds |
|---|---|
| `src/main.jsx`, `src/App.jsx` | Entry point, routes, and the scaling wrapper that fits the interface to any screen |
| `src/earth/` | The Earth interface: page, astronaut list, alert feed and history, wellbeing section, symptom report, settings |
| `src/shared/` | Kit shared by the interface: API client, polling hook, translator and dictionaries, language store, dashboard view |
| `src/components/` | Body diagram, skeleton, questionnaire dialogs, modal |
| `src/lib/` | Pure logic: body outline and regions, levels, questionnaires (English and Spanish) |
| `src/connection.js` | Store that tracks whether the backend answers (drives the warning toast) |
| `src/theme.css`, `src/earth/*.css` | Styles: theme variables, layout, diagram, dialogs |
| `public/mocks/` | Sample responses used when `VITE_USE_MOCKS=true` |

## Rules the code follows

1. **The backend decides every colour.** Each response carries a `level` (`green`, `yellow`, `orange`, `red`). The
   frontend only paints it and never compares a number with a threshold. The only exceptions are listed in
   [../docs/earth-interface.md](../docs/earth-interface.md#how-missing-data-is-handled).
2. **Missing data never empties the screen.** The last value received stays visible.
3. **All text goes through the translator.** Nothing user-facing is hard-coded in a component; see
   [../docs/i18n.md](../docs/i18n.md).

## More documentation

- [../docs/earth-interface.md](../docs/earth-interface.md): what each part of the screen does.
- [../docs/frontend-architecture.md](../docs/frontend-architecture.md): how the code is organised and how to extend it.
- [../docs/api-usage.md](../docs/api-usage.md): the endpoints the frontend calls and the payloads it sends.
- [../docs/i18n.md](../docs/i18n.md): languages and how to add texts.
- [src/earth/README.md](src/earth/README.md): the original Earth pack guide from the ground team.
