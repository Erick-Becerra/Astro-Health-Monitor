# Earth app contract (App 1)

Base URL: `http://<HOST_IP>:8000` (Earth). Extract of [apps-contract.md](apps-contract.md): only what Earth needs.

## Conventions for all three

- **Who is calling.** Send the header `X-Actor: <name of the person>` (and, if you want,
  `X-App: <app name>`) on every call that writes. It is recorded in the change log. Without it
  the actor is the app name (`simulator-app`, `space-app`, `earth-app`).
- **Time**: ISO 8601, UTC (`2026-11-14T17:30:00Z`). No time zone means UTC.
- **IDs**: `astronaut_id` is any text of 1 to 32 characters (`AST-01`). An astronaut is
  created the first time data arrives for it.
- **Levels**: every evaluation answers `level` = `green`, `yellow`, `orange` or `red`, and
  `status` = `ok`, `attention` or `critical` (orange counts as attention).
- **Variables**: `GET /api/variables` (same on both servers) lists every variable with its unit,
  range, who writes it and in which app it is edited. Build the editable controls from it.
- **Errors**: out-of-range or unknown values answer `422` with the reason. Never a silent change.

## Who decides the colour: the backend. The frontend only paints.

Every response already carries the verdict: `level` (`green`, `yellow`, `orange`, `red`) and `status`
(`ok`, `attention`, `critical`), plus `findings` with what is wrong and the advice. The frontend must **not**
compare numbers with thresholds, for three reasons:

1. The ranges are not the same for everybody and every moment: each astronaut can have **personal thresholds**
   (set from Earth) and what is normal changes with the **activity** (exercising, sleeping, spacewalk...).
2. The ranges are still being reviewed with the clinical team. They live in one place on the backend
   (`backend/shared/indicators.py`, used by `vitals.py` and `clinical.py`), so changing them changes every screen at once.
3. Earth and the station give the same colour for the same data: both run the same calculation
   (`backend/shared/clinical.py`). Earth's only lags behind by the link latency.

What the frontend does: map `level` to a colour, show `value` + `unit`, and show the finding text. Each finding carries
`level`, `level_name` (Normal / Caution / Moderate risk / Critical), `criteria` (the range), `message`, `action` and
`procedure` (numbered steps), all taken from the indicators document; `advice` is kept as an alias of `action`.
Every rule is listed in [indicators.md](indicators.md) (generated from `backend/shared/indicators.py`).
Which field to read for which screen:

| Screen | Colour field |
|---|---|
| Earth, list of astronauts | `overall_level` (sensors + latest manual captures) |
| Earth, one astronaut | `overall_level`, and `level` of each of the 8 `systems` in `GET /api/astronauts/{id}/dashboard`; `level` alone is only the sensors and `manual_level` only the manual measurements |
| Astronaut console | `level` of the dashboard, and `level` of each of the 8 `systems` for the map |
| Any single indicator | `level` of its entry in `vitals` or in `findings` |


## App 1: Earth monitoring, talks to Earth

### Reads

| Call | What you get |
|---|---|
| `GET /api/astronauts` | Everyone, with the latest reading, name, gender and three colours: `level` (from the sensors only), `manual_level` (from the latest blood pressure, glucose, PHQ-9, GAD-7) and **`overall_level`** (everything: the same colour the astronaut console shows; use this one for the home screen) |
| `GET /api/astronauts/{id}` | The same plus findings of the latest reading, profile, personal thresholds, exercise goals, radiation budget |
| `GET /api/astronauts/{id}/dashboard` | The consolidated view, **calculated exactly like the astronaut console's** (same fields as that dashboard: vitals with baseline and signal quality, the 8 systems with their colour, radiation, data quality, guides), over the data that has reached Earth |
| `GET /api/astronauts/{id}/readings?since=&until=&bucket_seconds=&limit=` | Biometric telemetry history for trends (heart rate, temperature, sleep, PVT-B, radiation...). Use `bucket_seconds` for long ranges |
| `GET /api/astronauts/{id}/manual?kind=` | Manual captures: blood pressure, glucose, PHQ-9 / GAD-7 (with `item9_alert`), log |
| `GET /api/astronauts/{id}/questionnaires`, `/{questionnaire_id}`, and `GET /api/questionnaires` (everyone) | The saved PHQ-9 / GAD-7 with the JSON the front sent: answers, score, severity, recommendation, who answered |
| `GET /api/astronauts/{id}/context` | To audit an alert: cabin CO2 series, semaphore history, protocol log |
| `GET /api/astronauts/{id}/level-history` | Every change of colour with the reasons |
| `GET /api/astronauts/{id}/radiation` | Radiation budget |
| `GET /api/alerts?astronaut_id=` | Alerts. `id` always grows: remember the highest to find new ones |
| `GET /api/station` | State of the station link |
| `GET /api/changes` | **Change log** (below) |
| `GET /api/outbox?pending_only=true` | What Earth sent that has not reached the station yet |

An alert is raised when an indicator is new or gets worse compared with the previous 10 minutes, when a
manual capture comes out orange or red (and always for PHQ-9 item 9), and when a sensor **loses its signal**.

### Writes (they travel to the station after the link latency)

Every write answers `station_delivery_at` (when it will arrive) and writes the change log.
While the link is down the station refuses it and Earth retries until it arrives. Nothing is lost.

| Call | Body |
|---|---|
| `PUT /api/astronauts/{id}` | Record and baseline. Any of: `name`, `gender` (`female`/`male`/`other`), `birth_date` (`1988-05-17`), `weight_kg`, `agency` (`NASA`, `CSA`, `ESA`, `Roscosmos`, `other`: sets the career limit, 600 or 1000 mSv), `baseline_hr`, `baseline_bp_systolic`, `baseline_bp_diastolic`, `dxa_t_score`, `oct_notes`, `prior_radiation_msv`. Fields you leave out do not change |
| `DELETE /api/astronauts/{id}?confirm=true` | Deletes the astronaut from Earth with everything that hangs from it (readings, alerts, level history, manual captures, questionnaires, symptom reports, CSV record files, personal thresholds). **Cannot be undone**: without `confirm=true` it answers 400. 404 if it does not exist. Answers `{"deleted", "name", "rows": {table: count}}`. The change log keeps one entry saying who deleted it. The station keeps its own copy: if it sends new data for the same id, the astronaut appears again as a new one |
| `GET /api/astronauts/{id}/thresholds` | Personal thresholds **and the defaults**, so the form can show both |
| `PUT /api/astronauts/{id}/thresholds` | `{"body_temperature": {"yellow": 37.3, "orange": 37.8, "red": 38.3}}`. A value at or above each number gets that colour. `null` for an indicator = back to the default. Adjustable: heart rate, temperature, blood pressure, sleep nights, reaction time, radiation, CO2, respiratory rate |
| `PUT /api/astronauts/{id}/exercise-goals` | `{"ared_sessions_per_week": 4, "ared_minutes_per_session": 45, "notes": "..."}` |
| `POST /api/astronauts/{id}/notes` | `{"body": "...", "kind": "note" or "prescription", "severity": "info"}` (asynchronous medical note) |
| `POST /api/astronauts/{id}/messages` | `{"body": "...", "severity": "info"}` (guidance to the astronaut) |

Personal thresholds change the colours **on both sides**: Earth uses them when it analyses and the station
uses them for the dashboard, once they arrive. They also move with the activity (see App 3).

---


### Read it later

| Where | Call |
|---|---|
| Station | `GET /api/crew/{id}/questionnaires` and `GET /api/crew/{id}/questionnaires/{questionnaire_id}` |
| Earth, one astronaut | `GET /api/astronauts/{id}/questionnaires` and `GET /api/astronauts/{id}/questionnaires/{questionnaire_id}` |
| Earth, everyone | `GET /api/questionnaires` (add `astronaut_id` to narrow it down) |

Filters of the lists: `questionnaire` (`phq9` or `gad7`), `answered_by`, `since`, `until` (ISO times) and `limit` (up to 500).
Newest first. Every item has `response`: the JSON the front sent, as an object.

They are saved on the station and go up to Earth after the link latency (and wait if the link is down); Earth keeps the
same JSON.

### Where the recommendations come from

The PHQ-9 page (hiv.uw.edu/page/mental-health-screening/phq-9) has a table with the proposed action for each severity: the
front takes them from there. The GAD-7 page has no table by severity (it only gives the cut-off of 8 for further
assessment), so those texts have to be agreed with the clinical team.
The severity bands are: **PHQ-9** 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe;
**GAD-7** 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe. The PHQ-9 page also says that a question 9 above 0 needs an
assessment of the risk by a competent person (the GAD-7 has no question 9). The front helper `docs/frontend/shared/questionnaires.js` has these bands, a draft
recommendation per severity and `buildQuestionnaire()`, which makes the JSON.

## Change log

"Who changed which variable, when, from what to what", on both sides. The station keeps its own and
uploads it, so **Earth's `GET /api/changes` shows everything**.

```json
{"id": 44, "at": "2026-11-14T17:49:36+00:00", "origin": "station", "astronaut_id": "AST-01",
 "variable": "glucose", "old_value": {"value": 62.0, "context": "fasting"},
 "new_value": {"value": 92.0, "context": "fasting"}, "actor": "crew", "app": "space-app", "note": "manual capture"}
```

- **What is logged**: every simulator variable that changes (including a sensor losing its signal, as a change
  to `null`), mission day / latency / link, the manual captures and the log, every profile / threshold / goal /
  note edited on Earth (and when it arrives on the station).
- **Continuous telemetry** (heart rate, temperature, blood pressure...) is logged when it moves at least
  `log_delta` from the last logged value (see `GET /api/variables`), so sensor noise does not fill the log.
- **Filters**: `astronaut_id`, `variable` (thresholds are `thresholds.<indicator>`), `origin` (`earth` or `station`, Earth only), `since`, `limit`.
- **Who**: the `X-Actor` header. Without it, the app name.

---

## Keeping the screens up to date (real time)

There is **no push** (no WebSocket or server-sent events): the screens **poll** the REST API. It is simple, it
works with any framework and it is fast enough here, because new data arrives every second or two and Earth
sees it after the link latency anyway. SWR and React Query are not part of the backend: they are libraries of the
frontend that do the polling for you, and both fit.

| Screen | Call | Every |
|---|---|---|
| Astronaut console, main panel | `GET /api/crew/{id}/dashboard` | 2 s |
| Earth, home (everyone) | `GET /api/astronauts` | 3 s |
| Alerts | `GET /api/alerts?limit=20` | 3 s |
| Charts | `GET /api/astronauts/{id}/readings?since=...&bucket_seconds=...` | 10 s |
| Change log, outbox | `GET /api/changes`, `GET /api/outbox` | 5 s |

```js
// SWR
import useSWR from "swr";
const fetcher = (url) => fetch(url).then((r) => r.json());
const { data, error } = useSWR(`${STATION}/api/crew/${id}/dashboard`, fetcher, { refreshInterval: 2000 });

// React Query
import { useQuery } from "@tanstack/react-query";
const { data } = useQuery({
  queryKey: ["dashboard", id],
  queryFn: () => fetch(`${STATION}/api/crew/${id}/dashboard`).then((r) => r.json()),
  refetchInterval: 2000,
});
```

Both stop polling when the tab is hidden. Remember that **Earth's data lags behind the station's on purpose**
(the link latency): if the Earth screen looks "late" compared with the console, that is the simulation working.
If you later want it pushed instead, a server-sent events stream is a small addition on the backend.

---

## Demo data

`backend/seed_apps_demo.py` creates data through the real endpoints (the same calls the apps will make):
six hours of v1.1 packets, the crew's manual captures, and the record and rules written from Earth.

```
docker compose exec -T space-station python seed_apps_demo.py
```

It takes about 15 seconds and running it twice does nothing. To start over:

```
docker compose exec -T db psql -U astro -d astro_health < database/demo/reset_apps_demo.sql
docker compose exec -T space-station python seed_apps_demo.py
```

| Astronaut | Story | What it shows |
|---|---|---|
| `AST-01` Lucía Fernández, NASA | Cabin CO2 climbs to orange, an exercise session, a headache report | Environment alerts, activity-aware thresholds, the eyes system |
| `AST-02` Tomás Herrera, ESA | Solar particle event (250 mSv), a spacewalk, then a fever | Radiation budget, solar-event alert, **personal thresholds** (his fever is orange where the default would be yellow) |
| `AST-03` Sofía Navarro, CSA | 3 short nights, heart sensor **lost** for 15 min, temperature sensor **degraded**, low glucose, high blood pressure, PHQ-9 item 9, headaches and blurred vision | Data quality, the brain system in red, the item 9 alert, `overall_level` red while the sensors say orange |

The mission is set to day 78 and a 2.6 s latency (Moon). The names and profiles are made up.
The built-in demo crew `A001` to `A003` keeps running on its own next to them.

## Things to know

- **Thresholds and ranges** follow the Health Indicators document (Telemetry v1.1) and live in
  `backend/shared/indicators.py`; see `docs/indicators.md`. Some gaps of the document (resting HR 40-49 and
  above 130, temperature below 36.1, lost signal under 5 min, default PVT baseline 300 ms) were filled with
  assumptions that the clinical team must confirm.
- **IDs**: the demo crew of the three apps is `AST-01` to `AST-03`, the format of the simulator. `A001` to `A003`
  are the older built-in demo.
- **A packet with a time in the future** waits on the station until that time (plus the latency) before it is uploaded.
- **The simulator's `mission_day`** is no longer in the packet: set it with `PUT /api/sim/mission`. It is used for the
  bone-loss estimate and the ARED adherence check (from day 30).

## Astronaut record (CSV) — Earth only
Earth can upload one record file per astronaut (CSV, up to 2 MB, UTF-8 or Windows-1252, delimiter `,` `;` tab or `|`).
It stays on Earth (the station never gets it) and is not part of the dashboard: the app asks for it only when the user opens it.
Every upload is a **new version**; nothing is overwritten. The first of the list is the current record.

| Call | Does |
|---|---|
| `POST /api/astronauts/{id}/records` | Upload. Form (`file`, optional `note`) or raw body (`Content-Type: text/csv` + `?filename=expediente.csv`). `201` with `id, filename, columns, row_count, delimiter, size_bytes, uploaded_by, uploaded_at` |
| `GET /api/astronauts/{id}/records` | List, newest first, without contents (`[]` if none) |
| `GET /api/astronauts/{id}/records/{file_id}` | Data of one (`file_id` = number or `latest`) |
| `GET /api/astronauts/{id}/records/{file_id}/rows?offset=0&limit=100` | The CSV as JSON for a table: `columns`, `rows`, `total` |
| `GET /api/astronauts/{id}/records/{file_id}/download` | The file exactly as uploaded |

Errors: `404` unknown astronaut or file, `413` over 2 MB, `422` not a `.csv`, empty or binary. Who uploaded it (header `X-Actor`) goes to the change log; the contents never do.
Kit: `earth.uploadRecord(id, file, actor, note)`, `earth.records(id)`, `earth.recordRows(id)`, `earth.recordUrl(id)`.

## Symptom report ("something hurts / I feel unwell")
The astronaut console sends it; the station stores it with the vitals of that moment; Earth keeps it in the record of the
astronaut **and raises an alert** (the alert is already known by the station, it is not sent back to it).

| Call | Does |
|---|---|
| `POST :8001/api/crew/{id}/symptom-report` | `{"symptom": "headache", "severity": "moderate", "body_area": "head", "description": "free long text", "reported_by": "name"}`. `symptom`: pain, headache, nausea, dizziness, fatigue, fever, breathing_difficulty, chest_pain, vision, mood, injury, other. `severity`: mild, moderate, severe. Only the first two are required. `201` with the stored report (id, reported_at, vitals...) |
| `GET :8001/api/crew/{id}/symptom-reports` | The station's list, newest first (`severity`, `since`, `limit`). `uplinked_at` says whether Earth already has it |
| `GET :8001/api/symptoms` | The values for the form |
| `GET :8000/api/astronauts/{id}/symptom-reports` | Earth's record of one astronaut (`severity`, `symptom`, `since`, `until`, `limit`) |
| `GET :8000/api/symptom-reports` | Every astronaut's reports (same filters plus `astronaut_id`) |

Each report has `vitals` (latest heart rate, temperature, SpO₂... at that moment). On Earth, the alert (`GET /api/alerts`) says who, what
and how serious, with a numbered procedure: severe is `critical`, mild and moderate are `attention`. `422` for an unknown symptom or severity,
`409` if the same symptom is reported twice in the same second. Kit: `station.reportSymptom(...)`, `earth.symptomReports(id)`.
