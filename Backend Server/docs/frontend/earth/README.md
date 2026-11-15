# Earth pack: monitoring app (App 1)

Everything the front team needs to build the **Earth monitoring app** (mission control, medical officer). It talks
**only to the Earth base server** (`:8000`). What the station measures reaches Earth by itself, **after the link
latency** (2.6 s on the Moon, up to 44 min on Mars): it is normal for Earth to lag behind the astronaut console.

Read first: [../README.md](../README.md) (rules and setup, common to both packs) and
[../../apps-contract.md](../../apps-contract.md) (the contract, App 1).

## Files

| File | What it is |
|---|---|
| `earthApi.js` | The client of Earth: every read and write, with the mock of each one |
| `EarthPage.jsx` | The app wired up: list every 3 s, alerts every 3 s, detail, thresholds editor, pending deliveries |
| `AstronautList.jsx` | Home screen: everyone, the worst first, colour = `overall_level` |
| `useNewAlerts.js` | Alerts and which ones are new (by the highest `id` seen) |
| `ThresholdsEditor.jsx` | Personal thresholds: default as a hint, only what changed is sent |
| `TrendChart.jsx` + `chartData.js` | Trend charts (Recharts) with the semaphore as background and the lost-signal periods marked |
| `../shared/DashboardView.jsx` | The consolidated screen of one astronaut (same as the console's) |

## The screens, piece by piece

| Screen | Data |
|---|---|
| **Home: all astronauts** | `earth.astronauts()` every 3 s. Colour = `overall_level` (everything, same as the console). `level` is only the sensors and `manual_level` only the manual measurements |
| **One astronaut** | `earth.dashboard(id)`: 8 systems, vitals with baseline and signal quality, radiation, data quality. Same shape as the console's, so `DashboardView` and `buildCards` work as they are. `earth.astronaut(id)` adds profile, thresholds, goals |
| **Alerts feed** | `earth.alerts({ limit })` every 3 s. `useNewAlerts()` tells which are new |
| **Trends** (heart rate, temperature, sleep, PVT-B, radiation...) | `earth.readings(id, { since, bucketSeconds, limit })` then `toChartData`. Over an hour of range use `bucketSeconds` (300 = a point every 5 min) |
| **Semaphore history** ("when and why did it change") | `earth.levelHistory(id)`: each change with the `reasons`. `levelBands()` turns it into chart background |
| **Audit an alert** | `earth.context(id)`: cabin CO2 series (alert from 2.3, limit 3.0), semaphore history, protocol log |
| **Crew captures** (blood pressure, glucose, PHQ-9 / GAD-7, symptom log) | `earth.manual(id, { kind })`. PHQ-9 comes with `severity` and `item9_alert` |
| **Saved questionnaires** (the full PHQ-9 / GAD-7 with who answered, score, severity and recommendation) | `earth.questionnaires(id, { questionnaire, answeredBy, since, until })`, `earth.questionnaire(id, questionnaireId)` and `earth.allQuestionnaires()` for everyone. Each item has `response`: the JSON the front of the astronaut saved. They arrive after the link latency |
| **Radiation** | `earth.radiation(id)`: dose, % of the career limit, solar event alert |
| **Who changed what** | `earth.changes({ astronaut_id, variable, origin, since })`. `origin` is `earth` or `station`; thresholds are `thresholds.<indicator>` |
| **Sent to the station** | `earth.outbox({ pendingOnly: true })`: what has not arrived yet (`delivered_at` empty) |

### Editing (everything travels to the station after the latency)

| Form | Call | Notes |
|---|---|---|
| Record and baseline | `earth.putProfile(id, patch, actor)` | `name`, `gender`, `birth_date`, `weight_kg`, `agency` (sets the 600 / 1000 mSv limit), `baseline_hr`, `baseline_bp_systolic`, `baseline_bp_diastolic`, `dxa_t_score`, `oct_notes`, `prior_radiation_msv`. What you leave out does not change |
| Personal thresholds | `earth.thresholds(id)` then `earth.putThresholds(id, patch, actor)` | Show personal AND default. `null` = back to the default. Only some indicators can be adjusted (the ones in `adjustable`) |
| ARED goals | `earth.putExerciseGoals(id, patch, actor)` | |
| Medical note / prescription | `earth.addNote(id, { body, kind, severity }, actor)` | `kind`: `note` or `prescription` |
| Message to the astronaut | `earth.sendMessage(id, { body, severity }, actor)` | |

After every write show "pending delivery to the station" until the item leaves `outbox({ pendingOnly: true })`. While
the link is down the station refuses them and Earth retries by itself: nothing is lost, and it is not an error.
Send the name of the person in `actor` (header `X-Actor`): it is what the change log shows.

## How to extract the data

| What | Call | How often | If it fails |
|---|---|---|---|
| Home | `earth.astronauts()` | 3 s | Keep the last list, show "no connection" |
| Alerts | `useNewAlerts()` | 3 s | Same |
| One astronaut | `earth.dashboard(id)` | 3 s, only while it is open | `404` = no data yet |
| Charts | `earth.readings(...)` | 10 s, or when the range changes | |
| Thresholds, goals, profile | `earth.thresholds(id)`... | when the screen opens and after saving (30 s is enough) | |
| Pending deliveries, link | `earth.outbox`, `earth.link()` | 5 s | |

Rules of the extraction:
- **Earth is not "live".** Compare with the time of the data (`latest.timestamp`, `measured_at`), not with the clock:
  if the link latency is 40 minutes, data 40 minutes old is normal. Use `isStale(measured_at, maxSeconds)` with a limit
  that fits the latency (`earth.link()` tells it).
- **`null` is not zero**: a sensor without signal arrives as `null`. In charts use `connectNulls={false}` so the line has a gap.
- **The first answer of the alerts is the starting point**: alerts that already existed are not "new" (`useNewAlerts`).
- **Colours come from the backend**: `overall_level`, `level`, `systems[].level`. No thresholds in the front.
- `422` explains itself (for example "yellow < orange < red is required"): show it.

## Test data

`AST-01` (yellow), `AST-02` (orange: a fever judged by his **personal thresholds**, a solar event in the history),
`AST-03` (red: item 9 alert, lost heart sensor in the history). `A001`-`A003` are an older demo that keeps changing on
its own. To work offline use `docs/mocks/earth/` with `VITE_USE_MOCKS=true`. A mock exists only for the astronaut named in
its file (for example `dashboard-AST-03.json`, `thresholds-AST-02.json`): asking for another one with mocks on says "Mock
not found". Regenerate them all with `python scripts/export_mocks.py`.

## Done when

- [ ] Home lists everyone with the worst first and the colour of `overall_level`.
- [ ] The detail of an astronaut shows the 8 systems, the vitals with baseline, the radiation and the data quality.
- [ ] A new alert is announced once, and not for the alerts that already existed when the page opened.
- [ ] A charted sensor loss shows a gap (not the last value), and the periods without signal are marked.
- [ ] An edit shows "pending delivery" until it reaches the station, and survives a blackout of the link.
- [ ] Every edit sends the name of the person (`X-Actor`) and appears in the change log.
- [ ] A refused edit (`422`) shows the reason of the backend.
- [ ] Every user text is in English (dictionary) and an unknown key does not break the screen.

## Prompt for the Claude of the Earth team

Copy everything between the lines into the assistant.

----------------------------------------------------------------------
You are my frontend development assistant at a hackathon (NASA Space Apps 2026, challenge "health monitoring software
for astronauts"). I am going to build the **Earth monitoring app** (App 1: mission control / medical officer). It talks
ONLY to the **Earth base** server. The backend (FastAPI) is already built and working: I only do the
frontend (React 19 + Vite + Recharts, `frontend/` folder).

READ BEFORE WRITING CODE, in this order:
1. `docs/frontend/README.md`  (rules and setup)
2. `docs/frontend/earth/README.md`  (this guide: screens, data extraction, editing)
3. `docs/apps-contract.md`  (sections "App 1", "Change log" and "Who decides the colour")
4. `docs/mocks/README.md` and the JSON files in `docs/mocks/earth/` (real responses)
5. The code in `docs/frontend/shared/` and `docs/frontend/earth/`: it is an example kit already tested against the real API.
   Use it as a base (copy it to `frontend/src/`); do not rewrite it from scratch.

WHAT TO BUILD
- Home: list of all astronauts, the worst first, with the `overall_level` colour, name, gender and latest data.
- Detail of one astronaut: the 8 systems with their colour, vitals against the baseline, radiation, signal quality.
- Alerts: feed with a notice for NEW alerts.
- Trends (Recharts): heart rate, temperature, sleep, PVT-B, radiation, with the semaphore as background and the
  periods without signal marked.
- Manual crew captures (blood pressure, glucose, PHQ-9/GAD-7 with the Item 9 alert, log).
- Context of an alert: cabin CO2, semaphore history, protocol log. Change log.
- Editing: record and baseline, personalised thresholds (default vs personal), exercise goals, medical notes
  and messages to the astronaut. Everything travels to the station with a delay: show "pending delivery".
- The visual design is free; the data contract is not.

NON-NEGOTIABLE RULES
1. **The backend decides the state and the colour** (`overall_level`, `level`, `systems[].level`). The front only paints.
   NEVER compare numbers with thresholds in the front: they depend on activity and on personal thresholds per astronaut.
2. **Earth is NOT "live"**: it sees the data after the link latency (2.6 s on the Moon, up to 44 min on
   Mars). Judge staleness by the time of the data (`measured_at`) and not by the clock; it must not look like an error.
3. **`null` is not zero**: a sensor without signal arrives as `null`. In charts use `connectNulls={false}` (the line
   has a gap; do not fill in with the last value).
4. **Poll every 3 s** (list, alerts, detail); charts every 10 s or when the range changes. The next request
   starts when the previous one ends; pause while the tab is hidden; if it fails, keep the last data and warn.
5. **New alerts** = `id` greater than the highest seen; the first response is the starting point (`useNewAlerts`).
6. **Every write sends `X-Actor`** with the name of the person (it stays in the change log), and `422`s are
   shown with the backend's reason (`describeError`). A rejected or waiting write is not a failure.
7. **User texts in English (en-US)** with `docs/frontend/shared/i18n-en.json` by key; a missing key
   must not break the screen. The `findings[].message` / `action` / `procedure` phrases come in English for now.
8. Talk only to Earth (`VITE_EARTH_URL`). The IP changes if the hotspot restarts: it goes in `.env`, never in the code.
   Ask me for the current IP.

HOW TO EXTRACT THE DATA (design it this way)
- Home: `GET /api/astronauts` (includes `overall_level`, the same colour as the astronaut's console).
- Detail: `GET /api/astronauts/{id}/dashboard` (same shape as the console: `DashboardView` and `buildCards` work).
- Long history: `GET /api/astronauts/{id}/readings?since=...&bucket_seconds=300&limit=5000`.
- Answered PHQ-9 and GAD-7 questionnaires: `GET /api/astronauts/{id}/questionnaires` (or `GET /api/questionnaires` for everyone),
  with filters `questionnaire`, `answered_by`, `since`, `until`. Each item carries `response`: the JSON saved by the astronaut's
  front (answers, score, severity, recommendation, who answered). They reach Earth after the latency.
- Delivery status of what was sent to the station: `GET /api/outbox?pending_only=true`.
- Change log: `GET /api/changes` (filters `astronaut_id`, `variable`, `origin`, `since`).

HOW TO WORK
- Start with `VITE_USE_MOCKS=true` (copy `docs/mocks` to `frontend/public/mocks`); then switch to the real API.
- Test data: AST-01 (yellow), AST-02 (orange, personal thresholds and solar event), AST-03 (red, sensor without
  signal, Item 9 alert).
- Before calling something done, test it against the real API and check the "Done when" list of
  `docs/frontend/earth/README.md`.
- If something in the contract is unclear or a field is missing, do NOT invent it: tell me what is missing and I will ask the backend.
----------------------------------------------------------------------
