# Station pack: astronaut console (App 2) and sensor simulator (App 3)

Everything the front team needs to build the **console of the astronaut** and the **panel of the simulator**.
Both talk **only to the space station server** (`:8001`). The console never calls Earth: it has to keep working if
the link is down.

Read first: [../README.md](../README.md) (rules and setup, common to both packs) and
[../../apps-contract.md](../../apps-contract.md) (the contract, App 2 and App 3).

## Files

| File | What it is |
|---|---|
| `stationApi.js` | The client of the station: every read and write, with the mock of each one |
| `simulator.js` | `buildPacket()` (the v1.1 packet from slider values), `scenarios`, `setSleep`, `setMood`, `answersFromScore`, `setRadiationTotal`, `restoreNominal` |
| `ConsolePage.jsx` | The console wired up: dashboard every 2 s, link every 5 s, inbox every 5 s, inputs |
| `ManualInputs.jsx` | Forms: blood pressure, glucose, PHQ-9, GAD-7, symptom and action log |
| `SimulatorPanel.jsx` | Sliders, scenarios, signal quality per sensor, sleep, mood, glucose, radiation, restore |
| `../shared/DashboardView.jsx` | The screen drawn from the dashboard (banner, system map, system panel, 7 cards, radiation meter) |
| `../shared/questionnaires.js` | PHQ-9 / GAD-7: severity bands, draft recommendations, `buildQuestionnaire()` that makes the JSON to save |

## The screen, piece by piece

The dashboard (`GET /api/crew/{id}/dashboard`) has everything. Nothing is calculated by the front.

| Piece of the screen | Where it comes from |
|---|---|
| "Crew status" banner (green to red) | `dashboard.level`, text with `t.banner(level)` |
| Crew state (rest, exercise, EVA...) | `dashboard.environment.crew_state` |
| Anatomical map: one zone per system and its colour | `dashboard.systems[]` (`system`, `level`). 8 systems: `heart`, `lungs`, `brain`, `metabolism`, `thermal`, `radiation`, `bones`, `eyes`. The screen with 5 groups maps: Cardiovascular = `heart`, CNS/Brain = `brain`, Thermoregulator = `thermal`, Endocrine = `metabolism`, Whole body/Radiation = `radiation`; `lungs`, `bones` and `eyes` can be extra zones or be folded into those |
| Click on a zone: panel of the system | the `systems[]` entry: `hazard` (NASA hazard), `drivers[]` (what explains the colour), `level` |
| NASA hazard | `t.hazard(system.hazard)` |
| Measuring hardware | `t.system(key, "hardware")` (static text of the dictionary) |
| Description and "space physiology" | `t.system(key, "description")`, `t.system(key, "physiology")` (drafts, to validate) |
| Recommended action | `t.protocol(level)` (by level) plus `dashboard.guides[].steps` (the backend's sentences, in English for now) |
| The 7 cards (sleep, mood and stress, heart rate, blood pressure, temperature, radiation, glucose) | `buildCards(dashboard)` of `shared/monitor.js`: `level` and `values` of each one |
| Sleep "5.4 h" and "2 nights in a row" | `vitals` `sleep_hours` and `consecutive_nights_under_6h` |
| PHQ-9 and GAD-7 scores, item 9 alert | `manual_latest.phq9.score`, `.gad7.score`, `.phq9.item9_alert` |
| Radiation "87% (528)" and the meter | `radiation.percent_of_limit`, `radiation.total_msv`, `radiation.career_limit_msv` |
| Solar event alert | `radiation.solar_event_alert` (on while the event is active) |
| Value against the pre-flight baseline | `vitals[].baseline`, `vitals[].vs_baseline` |
| A sensor without signal | `vitals[].no_signal` and `dashboard.data_quality[]` |
| "Live telemetry" / "Offline mode" and latency | `GET /api/status`: `link_up`, `link_delay_seconds` |
| Messages from Earth | `GET /api/messages?astronaut_id=...&unread_only=true` and `POST /api/messages/{id}/ack` |
| Bone loss note ("1-1.5 % per month") | `bone_loss_estimate_percent` |

What the API does **not** have, so the front supplies it: the **ECG waveform** (only the beats per minute exist:
draw an animation from `heart_rate`), the long clinical texts (the dictionary has drafts), the **role of the subject**
("CDR-01") and the **gravity** ("0.16 g"). The advice sentences of `findings[].message` / `action` / `procedure` are in English for now.

## How to extract the data

| What | Call | How often | If it fails |
|---|---|---|---|
| Whole screen | `station.dashboard(id)` | 2 s | Keep the last data, show "no connection". `404` = no data for that astronaut yet |
| Link and latency | `station.status()` | 5 s | Same |
| Inbox | `station.messages(id, { unreadOnly: true })` | 5 s | Same |
| History of what the astronaut typed | `station.manual(id, { kind })` | when the screen opens, and after saving | |
| What Earth sent (baseline, thresholds, goals) | `station.config(id)` | when the screen opens | |

Use `usePolling` (in `shared/hooks.js`) or SWR / React Query. Rules for the extraction:

- **The next request starts when the previous one ends** (no pile-up) and **polling pauses while the tab is hidden**.
- **Null is not zero.** A value `null` and `no_signal: true` mean the sensor has no reading: show "NO SIGNAL", never the old
  number and never `0`.
- **Old data is a warning.** If `dashboard.measured_at` is older than ~15 s (`isStale`), show "NO RECENT DATA".
- **After saving something** (a blood pressure, a glucose) call `refresh()` so the screen updates now.
- **Errors**: `describeError(error)` gives a sentence; the `422` text says which value is out of range.

## Questionnaires (PHQ-9 and GAD-7)

The screen **writes the questions** and works out the result; the backend keeps the whole JSON as long text so it can
be read later (on the station and, after the link latency, on Earth).

```js
import { buildQuestionnaire } from "../shared/questionnaires.js";

const json = buildQuestionnaire({ kind: "phq9", answers: [2, 2, 1, 2, 1, 2, 1, 1, 0], answeredBy: "Sofía Navarro", t });
const saved = await station.saveQuestionnaire(astronautId, json, "Sofía Navarro");
if (saved.item9_alert) { /* show the item 9 alert */ }
```

- `answers`: 9 numbers for the PHQ-9, 7 for the GAD-7, each 0 to 3. `buildQuestionnaire` adds the score, the severity in
  its display name (`t.questionnaireSeverity`) and a **draft** recommendation (`recommendationFor`), and refuses wrong answers
  before they leave the screen. Pass your own `recommendation` when the clinical text is ready; put anything else you
  want kept (the text of the questions, the language...) in `extra`.
- **What the backend refuses (`422`)**: a wrong number of answers, an answer outside 0 to 3, a `score` that is not the sum,
  a missing `answered_by`, `severity` or `recommendation`. Show its message. A questionnaire saved twice for the same
  `answered_at` is `409`.
- **The answer** has `level`, `item9_alert` and `response` (the JSON that was kept). It also feeds the dashboard (the brain
  system and the "mood" card) and the item 9 alert, so you do not call anything else.
- **Reading them back**: `station.questionnaires(id, { questionnaire, answeredBy, since, until })` and
  `station.questionnaire(id, questionnaireId)`; each item has `response`.
- **Where the recommendations come from**: the PHQ-9 page has a table of proposed actions by severity (use it for the final
  texts); the GAD-7 page has none, so agree them with the clinical team. The full contract is in
  [../../apps-contract.md](../../apps-contract.md), "Saved questionnaires".

## The simulator panel

The sliders do **not** only change the screen: they **send to the station** (`POST /api/sim/packet`), and the console
shows what comes back. If you only change values in the browser, Earth never knows.

| Slider or control | What to send |
|---|---|
| Heart rate, systolic and diastolic, temperature, SpO2, breathing, CO2, radiation rate, activity | `buildPacket(id, values)` then `station.sendPacket(...)`. At most once per second per astronaut (two packets of the same second replace each other): wait ~600 ms after the last move, as `SimulatorPanel` does |
| Signal quality of a sensor (good, degraded, lost) | `buildPacket(id, values, { signal: { cardiovascular: "lost" } })` |
| Sleep hours + nights in a row | `setSleep(station, id, hours, nights)`: sends one daily assessment per night (the station counts the nights) |
| PHQ-9 and GAD-7 total scores, item 9 box | `setMood(station, id, { phq9, gad7, item9 })`: the backend wants the answers; `answersFromScore` makes them. Item 9 stays 0 unless the box is on, so a PHQ-9 total tops out at 24 without it |
| Glucose | `station.glucose(id, { value, context })` |
| Accumulated radiation ("528") | `setRadiationTotal(station, id, total, priorDose)` |
| Solar storm | the `solarStorm` scenario (a packet with the event active, 250 mSv) |
| Latency, link on/off, mission day | `station.putMission({ link_latency_seconds, link_up, mission_day })` |
| Restore nominal values | `restoreNominal(station, id)` |

Scenarios (`scenarios` in `simulator.js`; the display name is `t.scenario(key)`) and what the backend answers, verified:
`nominal`, `solarStorm` (radiation red, solar alert), `sleepDeficit` (5.4 h, 3 nights), `co2Rise` (respiratory system not
green), `heartSensorLost` (heart rate with no signal), `tachycardiaAtRest` (149 bpm: red), `exercise` (the same 150 bpm
while exercising is green), `hypertension`, `fever`, `lowGlucose` (red), `itemNine` (red alert).

Things to know:
- **Nothing is deleted.** Manual captures (PHQ-9, glucose...) stay in the history; new ones become the latest.
- After "restore nominal" the seven cards are green but the **overall level can stay yellow** if the astronaut has no
  resistive exercise (ARED) logged: that is a real finding of the bones system, not a value of the panel.
- The colours are the backend's. Moving a slider to 143/83 will not necessarily give the colour of your design.

## Test data

Three astronauts with six hours of history, each with a different story (see `../../apps-contract.md`, "Demo data"):
`AST-01` (CO2 to orange, yellow overall), `AST-02` (solar event, personal thresholds, orange), `AST-03` (sensor lost,
item 9 alert, red). To work offline use `docs/mocks/station/` with `VITE_USE_MOCKS=true`.

## Done when

- [ ] The screen follows the dashboard of the real server with `VITE_USE_MOCKS=false` and with the mocks.
- [ ] Every colour is a `level` that came from the backend: there is no number compared with a threshold in the front.
- [ ] A sensor without signal shows "NO SIGNAL", not the old value.
- [ ] If the server stops, the screen keeps the last data and says so; when it comes back, it recovers by itself.
- [ ] Every text the user sees is in English (dictionary), and a key that is not in the dictionary does not break the screen.
- [ ] The simulator panel changes what the console shows, and "Restore nominal values" works.
- [ ] Item 9 of the PHQ-9 above zero shows the alert on the console.

## Prompt for the Claude of the station team

Copy everything between the lines into the assistant.

----------------------------------------------------------------------
You are my frontend development assistant at a hackathon (NASA Space Apps 2026, challenge "health monitoring software
for astronauts"). I am going to build the **astronaut console** (App 2) and the **sensor simulator panel**
(App 3). Both talk ONLY to the **space station** server. The backend (FastAPI) is already built and
working: I only do the frontend (React 19 + Vite + Recharts, folder `frontend/`).

READ BEFORE WRITING CODE, in this order:
1. `docs/frontend/README.md`  (rules and setup)
2. `docs/frontend/station/README.md`  (this guide: screen, data extraction, simulator panel)
3. `docs/apps-contract.md`  (sections "App 2", "App 3" and "Who decides the colour")
4. `docs/mocks/README.md` and the JSON files in `docs/mocks/station/` and `docs/mocks/simulator/` (real responses)
5. The code in `docs/frontend/shared/` and `docs/frontend/station/`: it is an example kit already tested against the real API.
   Use it as a base (copy it to `frontend/src/`); do not rewrite it from scratch.

WHAT TO BUILD
- Astronaut console: status banner, anatomical map with one colour per system (8 systems), panel of the selected
  system (NASA hazard, hardware, findings, recommended action), the 7 cards (sleep, mood/stress, heart rate, blood
  pressure, temperature, radiation, glucose), radiation budget meter, inbox of messages from Earth, and forms
  (blood pressure, glucose, PHQ-9, GAD-7, symptom and action log).
- Simulator panel: sliders and scenarios that SEND packets to the station (they do not just change the screen).
- The visual design is free; the data contract is not.

NON-NEGOTIABLE RULES
1. **The backend decides the status and the colour.** Every response carries `level` (green, yellow, orange, red) and `status`.
   The front only paints. NEVER compare numbers with thresholds in the front: the ranges depend on the astronaut's
   activity and on personal thresholds, and are still under clinical review.
2. **`null` is not zero.** A sensor without signal arrives with `value: null` and `no_signal: true`: show "NO SIGNAL",
   never the old value or 0.
3. **Poll every 2 s** (`dashboard`) and every 5 s (`status`, messages). The next request starts when the previous one
   ends; pause if the tab is hidden; if it fails, keep the last data and warn.
4. **User-facing texts in English (en-US)** using `docs/frontend/shared/i18n-en.json` by key; a key that is not
   in the dictionary must not break the screen. The sentences of `findings[].message` / `action` / `procedure` come in English for now.
5. **Talk only to the station** (`VITE_STATION_URL`). The console cannot depend on Earth.
6. Every write sends the `X-Actor` header with the name of whoever is operating (it ends up in the change log).
7. `422` errors carry the reason: show it as is (`describeError`). `404` = no data yet.
8. The server address changes if the hotspot restarts: it goes in `.env` (`VITE_STATION_URL`), never in the code.
   Ask me for the current IP.

HOW TO EXTRACT THE DATA (design it this way)
- A single call `GET /api/crew/{id}/dashboard` feeds almost the whole screen; `buildCards()` builds the 7 cards.
- PHQ-9 and GAD-7 questionnaires: the front supplies the questions. Build the JSON with `buildQuestionnaire()`
  (`shared/questionnaires.js`: score, severity name, recommendation) and save it with
  `station.saveQuestionnaire(id, json, name)`. The backend keeps that whole JSON as long text and also updates
  the colours and the Item 9 alert. The final recommendations come from the "Proposed Treatment Actions" table on the
  PHQ-9 page; the GAD-7 ones must be agreed with the clinical team (the kit's are DRAFTS).
- Use `usePolling` (or SWR/React Query if they are already in the project).
- Old data: if `measured_at` is more than ~15 s old, show "NO RECENT DATA".
- After saving a capture, request the dashboard immediately (`refresh()`).
- What the API does NOT have and you supply: the ECG waveform (draw it animated from the bpm), the long clinical
  texts, the subject's role and the gravity.

HOW TO WORK
- Start with `VITE_USE_MOCKS=true` (copy `docs/mocks` to `frontend/public/mocks`); then switch to the real API.
- Test data: AST-01 (yellow), AST-02 (orange, solar event), AST-03 (red, sensor without signal, Item 9 alert).
- Before calling something done, test it against the real API and check the "Done when" list in
  `docs/frontend/station/README.md`.
- If something in the contract is unclear or a piece of data is missing, do NOT invent it: tell me what is missing and I will ask the backend.
----------------------------------------------------------------------
