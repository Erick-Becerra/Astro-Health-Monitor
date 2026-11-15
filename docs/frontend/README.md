# Frontend kit

What the front team needs to build the screens with what the backend gives. It is split in two packs, one for
each server, plus the pieces both share.

| Pack | For | Talks to | Guide |
|---|---|---|---|
| **Station** | Astronaut console (App 2) and sensor simulator (App 3) | Space station `:8001` | [station/README.md](station/README.md) |
| **Earth** | Earth monitoring app (App 1) | Earth base `:8000` | [earth/README.md](earth/README.md) |
| **Shared** | Both | n/a | `shared/` (below) |

Each guide ends with a **prompt to paste into the assistant (Claude)** of the person who builds that pack, and a
"Done when" checklist.

## How to start (5 steps)

1. Copy `docs/frontend/shared/` and the folder of your pack (`station/` or `earth/`) into `frontend/src/` (keep the
   relative paths between them).
2. Copy `docs/mocks/` to `frontend/public/mocks/`.
3. Make a `.env` in `frontend/`:

   ```
   VITE_USE_MOCKS=true
   VITE_STATION_URL=http://<HOST_IP>:8001
   VITE_EARTH_URL=http://<HOST_IP>:8000
   VITE_ACTOR=Your name
   ```

   `<HOST_IP>` is the computer that runs Docker (it changes if the phone hotspot restarts: ask for the current one).
4. Mount the page of your pack (`ConsolePage`, `SimulatorPanel` or `EarthPage`) and build on it.
5. When it works with the mocks, set `VITE_USE_MOCKS=false`.

## The rules, for both packs

1. **The backend decides the status and the colour.** Every answer carries `level` (`green`, `yellow`, `orange`,
   `red`) and `status`. The front only paints. Never compare a number with a threshold in the front: the ranges depend
   on the astronaut (personal thresholds) and on the activity (a pulse of 150 is normal while exercising), and they are still
   under clinical review. Changing them in the backend changes every screen at once.
2. **`null` is not zero.** A sensor that lost its signal sends `null` (and `no_signal: true` in the dashboard). Show "NO SIGNAL",
   never the old value.
3. **Poll, do not push.** There is no WebSocket: ask again every 2 to 3 seconds (`usePolling`, or SWR / React Query). The next
   request starts when the previous one ends; pause when the tab is hidden; if a request fails keep the last data and warn.
4. **Texts in English from the dictionary** (`shared/i18n-en.json`), by key. A key that is not there comes back as the
   key itself: it never breaks a screen. The advice sentences of `findings[].message` / `action` / `procedure` are in English for now.
5. **Say who is acting.** Every write sends the header `X-Actor` (it is what the change log shows).
6. **Errors explain themselves.** `422` carries the reason (show it), `404` is "no data yet", status `0` is "no answer from the server".
7. **Earth is delayed on purpose** (the link latency). The console is not.

## The shared pieces

| File | What it does |
|---|---|
| `shared/i18n-en.json` | English for every key the API sends (levels, systems, hazards, indicators, sensors, states...). The long clinical texts are drafts to validate |
| `shared/i18n.js` | `makeTranslator(dict)`: `t.level`, `t.system`, `t.indicator`, `t.unit`, `t.levelColor`... |
| `shared/request.js` | `request()`, mocks switch, `ApiError`, `describeError`, the environment variables |
| `shared/hooks.js` | `usePolling(fetcher, { seconds, deps })` with `data`, `error`, `loading`, `updatedAt`, `refresh()` |
| `shared/monitor.js` | `buildCards(dashboard)` (the 7 cards), `worstLevel`, `isStale`, `show`, `vitalOf`, `systemOf` |
| `shared/questionnaires.js` | PHQ-9 / GAD-7: severity bands, draft recommendations, `buildQuestionnaire()` that makes the JSON to save with `station.saveQuestionnaire()` |
| `shared/DashboardView.jsx` | The screen of one astronaut: banner, system map, system panel, cards, radiation meter, data quality. No styling on purpose |

The dashboard of the station (`GET /api/crew/{id}/dashboard`) and the one of Earth (`GET /api/astronauts/{id}/dashboard`)
have the same shape and are calculated the same way, so the same view and helpers serve both.

## What was tested

The kit is not a sketch: it was run against the real backend.

- The dictionary covers every key the backend can send (checked against the backend's own lists).
- The pure modules and the two clients, against the mocks and the live API: all the simulator scenarios, the errors
  (`422`, `404`), the answers of Earth and of the station, the charts' helpers.
- The React screens, mounted in a simulated browser against the live API: the console polls and turns red by itself
  when something happens on the station, shows "NO SIGNAL" for a lost sensor, keeps the last data when the connection
  drops and recovers; the forms show the verdict and the backend's errors; the simulator panel's sliders change what the
  station shows; the Earth page announces a new alert once.

Not tested: a real browser, the visual design (there is none on purpose), accessibility, and phone layouts.

## Where the contract is

[../apps-contract.md](../apps-contract.md) (all the endpoints and the packet of the simulator),
[../mocks/README.md](../mocks/README.md) (real responses as JSON), and the interactive docs of each server at `/docs`.
