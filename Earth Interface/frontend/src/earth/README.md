# Earth monitoring app (App 1) — frontend

The ground-control screen of Astro Health Monitor. A flight surgeon or mission-control operator picks an
astronaut from a list, follows the telemetry as a live log, reads the symptoms the crew reported from the
station, registers new astronauts, manages their records, and generates a printable health report for any
date range.

It talks **only to the Earth base server** (`:8000`). What the station measures reaches Earth **after the link
latency** (2.6 s on the Moon, up to 44 min on Mars), so Earth always lags behind the astronaut console. That is
expected, not a bug.

- Stack: React 19, Vite 8, React Router 7, Recharts 3. No UI framework (plain CSS).
- Everything in the app (UI text, code, comments) is in **English**.
- Route of the app: `/earth`. Route of the printable report: `/earth/report`.

---

## Contents

1. [Quick start](#1-quick-start)
2. [Configuration](#2-configuration)
3. [Project structure](#3-project-structure)
4. [The screen](#4-the-screen)
5. [Features in detail](#5-features-in-detail)
6. [API calls used](#6-api-calls-used)
7. [Data formats](#7-data-formats)
8. [Styling](#8-styling)
9. [Mock mode](#9-mock-mode)
10. [Rules of the project](#10-rules-of-the-project)
11. [Troubleshooting](#11-troubleshooting)
12. [Known limitations and ideas](#12-known-limitations-and-ideas)
13. [How to extend it](#13-how-to-extend-it)

---

## 1. Quick start

Requirements: a recent Node.js with npm (it was developed with Node 26), and the Earth backend running on a
reachable machine (or mock mode, see [Mock mode](#9-mock-mode)).

```bash
cd frontend
npm install
```

Create `frontend/.env` (see [Configuration](#2-configuration)), then:

```bash
npm run dev
```

Open <http://localhost:5173/earth>.

- The dev server listens on port **5173** and fails if it is taken (`strictPort`). If the port is busy, stop the
  Docker `frontend` container (`docker compose down`) or whatever is using it (`lsof -i :5173`).
- Vite reads `.env` **only when it starts**. After changing it, stop (`Ctrl+C`) and run `npm run dev` again.
- You do not need Docker to work on this app: run `npm run dev` directly. The backend can run anywhere.

---

## 2. Configuration

`frontend/.env` (never committed; it is in `.gitignore`):

```dotenv
VITE_EARTH_URL=http://172.20.10.2:8000
VITE_STATION_URL=http://172.20.10.2:8001
VITE_ACTOR=Dr. Rivera
VITE_USE_MOCKS=false
```

| Variable | What it does |
|---|---|
| `VITE_EARTH_URL` | Base URL of the Earth server. **Required** for real data. Default `http://localhost:8000`. |
| `VITE_STATION_URL` | Station server. This app does not call it; the variable exists because the shared client reads it. |
| `VITE_ACTOR` | Name of the person using the screen. Sent as the `X-Actor` header on every write and shown in the backend change log. |
| `VITE_USE_MOCKS` | `true` reads static JSON from `public/mocks/` instead of the server. Writes do nothing. See [Mock mode](#9-mock-mode). |

The IP of the backend machine changes when the phone hotspot restarts. Ask for the current one, update
`VITE_EARTH_URL` and restart Vite. A quick check:

```bash
curl -s http://<HOST_IP>:8000/api/astronauts | head -c 200
```

**CORS:** the browser calls the backend from `http://localhost:5173`. The backend must list that origin in
`CORS_ORIGINS`, and allow the `X-Actor` header and the `PUT`/`POST` methods. A CORS error in the browser console
is a backend configuration issue.

---

## 3. Project structure

```
frontend/
├── .env                      local settings (not committed)
├── public/mocks/             static JSON used in mock mode
└── src/
    ├── main.jsx              entry point: fonts, styles.css, theme.css
    ├── App.jsx               routes
    ├── theme.css             theme of the Earth app (dark HUD style)
    ├── styles.css            original scaffold styles (Home / AstronautDetail pages only)
    ├── pages/, components/   original scaffold (Home, AstronautDetail, BodyPointCloud); not part of this app
    ├── shared/               client and helpers shared with the other apps
    │   ├── request.js        fetch wrapper, ApiError, environment variables, mocks switch
    │   ├── hooks.js          usePolling()
    │   ├── monitor.js        isStale(), show(), worstLevel(), buildCards(), vitalOf(), systemOf()
    │   ├── i18n.js           makeTranslator(dict)
    │   ├── i18n-en.json      every text the API sends as a key (levels, systems, indicators, units...)
    │   ├── i18n-es.json      Spanish dictionary from the original kit (not used)
    │   └── DashboardView.jsx full dashboard view from the kit (not mounted)
    └── earth/                this app
        ├── EarthPage.jsx         the screen: layout, polling, dialogs
        ├── AstronautList.jsx     crew list, worst first
        ├── RecordSummary.jsx     short record card under the selected astronaut
        ├── ConsolePanel.jsx      terminal-style telemetry log
        ├── SymptomPanel.jsx      symptom reports of one astronaut
        ├── ReportBar.jsx         date range + "Generate report"
        ├── ReportPage.jsx        printable report (route /earth/report)
        ├── report.css            styles of the printable report
        ├── NewAstronautForm.jsx  register / edit an astronaut
        ├── RecordPanel.jsx       record (CSV): versions, table, upload
        ├── recordCsv.js          form fields, CSV builder, patches, next ID
        ├── earthApi.js           every call to the Earth server
        ├── useNewAlerts.js       alerts and which ones are new
        ├── chartData.js          helpers for charts (toChartData, levelBands, lostRanges)
        ├── TrendChart.jsx        chart with semaphore background (not mounted)
        └── ThresholdsEditor.jsx  personal thresholds editor (not mounted)
```

**Mounted** means rendered by the app today. `TrendChart`, `ThresholdsEditor` and `shared/DashboardView` were
part of the original kit; they work but the current design does not show them. They are kept for later.

Routes (`App.jsx`):

| Path | Component |
|---|---|
| `/earth` | `EarthPage` |
| `/earth/report` | `ReportPage` |
| `/`, `/astronaut/:id` | original scaffold pages, unrelated to this app |

---

## 4. The screen

`/earth` is one page with three columns. Each column scrolls on its own, so the page never grows.

```
┌──────────────┬───────────────────────────────────┬──────────────┐
│ Crew         │ Start date  End date  [Generate]  │ Alerts       │
│ + New        │ [Telemetry] [Symptoms 2]          │ (scrolls)    │
│  astronaut   │ ┌───────────────────────────────┐ │              │
│              │ │ Manual captures (pinned)      │ │ newest first │
│ ● Sofía      │ ├───────────────────────────────┤ │ up to 200    │
│   record     │ │ · [02:28:21] HEART RATE: 65   │ │              │
│   card       │ │ · [02:28:21] SLEEP: 5.1 h     │ │              │
│ ● Tomás      │ │ (console, scrolls)            │ │              │
│ ● Mateo      │ └───────────────────────────────┘ │              │
└──────────────┴───────────────────────────────────┴──────────────┘
```

- **A banner at the top** appears only when there is something to say: deliveries still pending to the station,
  or the connection to the server was lost (the last data stays on screen).
- Below 1100 px of width the columns stack.

### Data flow

```
usePolling (every N seconds) ─► earth.* (earthApi.js) ─► request() ─► Earth server
                                         │
                                         ▼
                          component state ─► render (colours come from the backend)
```

| What | Call | Interval | Used for |
|---|---|---|---|
| Crew | `earth.astronauts()` | 3 s | list, colours, `first_seen` |
| Dashboard of the selected astronaut | `earth.dashboard(id)` | 3 s, only while selected | console |
| Alerts | `earth.alerts({ limit: 200 })` via `useNewAlerts` | 3 s | right column |
| Pending deliveries | `earth.outbox({ pendingOnly: true })` | 5 s | top banner |
| Profile and goals | `earth.astronaut(id)` | 30 s, only while selected | record card, edit form |
| Record versions | `earth.records(id)` | 30 s, only while selected | record card |
| Symptom reports | `earth.symptomReports(id)` | 10 s, only while selected | Symptoms tab |
| Report data | `earth.readings(...)`, `earth.symptomReports(...)` | once per report | `/earth/report` |

`usePolling` (see `shared/hooks.js`): the next request starts only when the previous one ends, it pauses while the
browser tab is hidden, and on error it **keeps the last good data** and sets `error`. `refresh()` asks again
right away (used after saving).

---

## 5. Features in detail

### 5.1 Crew list (`AstronautList`, `RecordSummary`)

- Ordered by severity, worst first (`overall_level`), then by ID.
- Each row: status dot, name, sex, a label with the level (`NORMAL`, `WATCH`, `ATTENTION`, `EMERGENCY`, `NO DATA`)
  and the latest heart rate, temperature and activity.
- `overall_level` already combines sensors, manual captures, symptoms and radiation. It is the same colour the
  astronaut console shows. Never recompute it in the frontend.
- When a row is selected it expands into a **record card** with: agency, age, sex, weight; baseline heart rate and
  blood pressure; prior radiation; and the state of the record file ("Record #3 · 15/11/2026" or "No record file
  yet"). Buttons: **Full record** / **Upload record**, and **Edit profile**.
- **+ New astronaut** (above the list) opens the registration form.

### 5.2 Telemetry console (`ConsolePanel`)

A terminal-style log of the selected astronaut, on a near-black background, updated every 3 s.

- **One block per telemetry packet.** A block is added only when `measured_at` changes, not on every poll, so a
  quiet astronaut does not fill the log with repeated lines. Blocks are separated by a blank line. The last 80
  blocks are kept per astronaut in memory.
- Each block has one entry per vital (`heart_rate`, `hrv_ms`, `body_temperature`, blood pressure, `spo2`,
  respiratory rate, sleep, nights under 6 h, PVT-B, radiation rate, cabin CO₂), plus `ACTIVITY`, `MISSION DAY`,
  `RADIATION BUDGET`, `RADIATION TOTAL DOSE`, `SOLAR PARTICLE EVENT` (only when active) and `BONE LOSS ESTIMATE`.
- Entry format: `· [HH:MM:SS] LABEL: value unit`.
  - The `· [time]` part is coloured with the `level` the backend sent for that indicator.
  - A missing value prints `no data`; a lost sensor prints `no signal`. **`null` is never shown as zero.**
  - The timestamp shows only the time for today's data and `DD/MM HH:MM:SS` for anything older.
  - To colour the label up to the colon as well, set `COLOR_LABEL = true` at the top of `ConsolePanel.jsx`.
- **Pinned "Manual captures"** strip above the log: latest blood pressure, glucose, PHQ-9 (with the item 9
  alert line when present) and GAD-7, read from `manual_latest` of the dashboard. It does not scroll away and
  refreshes by itself when the crew records a new capture (it arrives after the link latency).
- **Autoscroll:** the view follows the newest line. Scrolling up pauses it; scrolling back to the bottom (within
  24 px) resumes it. The **Jump to latest** link in the header is always visible: dimmed while following, bright
  and clickable while paused.
- A **NO RECENT DATA** tag appears when the last packet is older than 60 s. On Earth that is normal if the link
  latency is high, or if the source is not sending.
- The console keeps its history when you switch to the Symptoms tab (it stays mounted, only hidden).

### 5.3 Symptoms tab (`SymptomPanel`)

Reports the astronaut sent from the station ("my head hurts", "I got hurt"), for the selected astronaut.

- Tab badge with the number of reports.
- Each report: severity label, symptom, body area, date and time, who reported it, free-text description, and
  the vitals measured at that moment.
- Severity colours: `mild` yellow, `moderate` orange, `severe` red. (The backend decides what each severity
  means: severe raises a critical alert, mild and moderate raise attention.)
- Filter by severity (client side). Newest first. Refreshes every 10 s.
- Every report also raises an alert in the right column; this tab keeps them per astronaut.

### 5.4 Alerts feed (right column)

- `GET /api/alerts` every 3 s, up to 200 alerts, newest first, in a fixed-height column with its own scroll.
- `useNewAlerts` remembers the highest alert `id` seen. The first answer is the starting point (alerts that
  already existed are not "new"); later higher ids count as new and show a button "N new alerts" that marks them
  as seen.
- 200 is a display limit chosen to keep the page light. Showing more would need pagination from the backend.

### 5.5 Printable health report (`ReportBar`, `ReportPage`)

**Starting it.** Pick **Start date** and **End date**, then **Generate report**. The report opens in a **new
tab** (`/earth/report?...`) and is saved as PDF from the browser's print dialog.

Validation (messages appear inside the page, never as browser alerts):

| Case | Result |
|---|---|
| No astronaut selected, or a date missing | error |
| End date before start date | error (the same day is allowed) |
| End date in the future | error |
| End date before the astronaut's first data (`first_seen`) | error: "has no data before DD/MM/YYYY" |
| Start date before `first_seen` | warning; the report starts at `first_seen` and says so |

Dates are whole days: from 00:00:00 of the start day to 23:59:59 of the end day, in local time. The end is
clamped to "now".

**The page** `/earth/report?astronaut=AST-01&from=2026-11-14&to=2026-11-15[&signs=heart_rate,spo2]`

| Parameter | Meaning |
|---|---|
| `astronaut` | astronaut ID |
| `from`, `to` | `YYYY-MM-DD` |
| `signs` | optional, comma-separated indicator keys; limits which chart sections are printed |

**Contents of the sheet** (A4, white background, navy header):

1. Header: title, astronaut name, requested range, a note if the data starts later than requested, and a
   `DEMO DATA` tag in mock mode.
2. **Symptoms reported** in the period: a summary by severity and a chronological table (date, severity,
   symptom, area, reported by) with description and vitals under each row. If there are none it says so; if
   the request fails the report is still generated and this section says it could not be loaded.
3. One section per indicator: Heart rate, Blood pressure (two series), Core temperature, Oxygen saturation,
   Respiratory rate, Sleep, Reaction time (PVT-B), Radiation rate, Cabin CO₂.
4. Footer: generation time, who prepared it (`VITE_ACTOR`).

**Chart rules** (so every section looks uniform):

- Every section has a statistics strip: latest, min, avg, max and number of samples.
- The chart is drawn only with **at least 3 samples and some variation**. Otherwise the section says
  "Not charted: N samples with no variation in this period" and keeps the statistics. No flat lines.
- Axes always have titles: X is "Time (local)" for ranges up to 2 days and "Date (day/month)" above; Y is the
  indicator and its unit. The Y range is adjusted to the data.
- Fewer than 20 samples (daily measurements such as sleep) draw only the real points. Dense series keep gaps where
  there is no data (`connectNulls={false}`).
- Data is requested bucketed (about 240 points per chart) so long ranges stay light.

**Saving the PDF.** Press **Save as PDF / Print** and choose "Save as PDF" in the browser's dialog. The page has
`@page { size: A4; margin: 12mm }`, hides the toolbar when printing and forces background colours
(`print-color-adjust: exact`). If colours are missing, enable "Background graphics" in the print dialog.
A direct download without the dialog would need a PDF library; it is not implemented.

### 5.6 Register or edit an astronaut (`NewAstronautForm`)

Opened from **+ New astronaut** (mode `new`) or **Edit profile** (mode `edit`).

- **Sections and fields** (see `recordCsv.js`): Identification (ID, name, birth date, biological sex, agency);
  Anthropometry and countermeasures (weight, height, ARED sessions per week, minutes per session, and a
  read-only daily energy requirement computed as 29 kcal/kg); Pre-flight baseline (resting heart rate,
  systolic and diastolic pressure, core temperature, DXA overall / hip / spine / legs, eye exam notes); Previous
  radiation.
- **ID:** the backend does not assign IDs. It is any text of 1–32 characters and the astronaut is created the
  first time a write arrives for it. The form proposes the next free `AST-NN` and lets you change it. In edit
  mode the ID is locked.
- **Required:** ID, name and agency (the agency sets the career radiation limit). Other validation comes from
  the backend: a `422` shows its reason inside the form.
- **Save sequence:**
  1. `PUT /api/astronauts/{id}` with the profile fields that were filled in.
  2. `PUT /api/astronauts/{id}/exercise-goals` if any goal was filled in.
  3. `POST /api/astronauts/{id}/records` with a generated CSV, if the checkbox is on.
  If step 3 fails after 1–2 succeeded, the form says the astronaut was saved but the file was not.
- **New:** the "also save as record file" checkbox starts **on**. **Edit:** it starts **off**, because a CSV made
  from the form contains only the form fields and a new upload becomes the current record.
- Fields left empty are **not sent**, so a value can be changed but not cleared from this form.
- **Download filled CSV** exports what is currently typed; **Download empty template** exports a blank file with
  every field.
- Writes travel to the station after the link latency; the top banner shows "pending delivery" until they
  arrive. While the link is down the backend keeps retrying: nothing is lost.

### 5.7 Record file (`RecordPanel`)

Opened with **Full record** / **Upload record**. The record is one CSV per upload, kept on Earth only.

- Every upload is a **new version**; nothing is overwritten. The first in the list is the current record.
- The panel shows the version selector (id, file name, date, who uploaded), the CSV as a table (100 rows per
  page), a link to download the original file, and an upload form (file + optional note).
- Errors: `413` "larger than 2 MB", `422` "the file was rejected" with the backend reason (not a `.csv`, empty or
  binary).
- The backend stores and returns the file; it does **not** read it. Uploading a CSV does not fill the profile.

**Profile vs. record file — which one to use**

| | Profile (Edit profile) | Record file (Upload record) |
|---|---|---|
| What it is | structured fields in the system | an archived CSV |
| Used in calculations | yes (baseline comparison, radiation limit by agency) | no |
| Goes to the station | yes | no (Earth only) |
| History | overwritten (the backend change log keeps who changed it) | versioned |
| Can hold fields the profile lacks (height, core temperature, DXA by site, calories) | no | yes |

---

## 6. API calls used

All in `earth/earthApi.js`. Base URL is `VITE_EARTH_URL`. The contract is in the documents of the backend team
(`apps-contract.md` and `earth-contract.md`).

**Reads**

| Call | Used by |
|---|---|
| `GET /api/astronauts` | list, `first_seen` for the report |
| `GET /api/astronauts/{id}` | record card (profile, exercise goals), edit form |
| `GET /api/astronauts/{id}/dashboard` | console |
| `GET /api/astronauts/{id}/readings?since&until&bucket_seconds&limit` | report charts |
| `GET /api/alerts?limit` | alerts feed |
| `GET /api/outbox?pending_only=true` | top banner |
| `GET /api/astronauts/{id}/records` | record card, record panel |
| `GET /api/astronauts/{id}/records/{file_id}/rows?offset&limit` | record table (`file_id` is a number or `latest`) |
| `GET /api/astronauts/{id}/records/{file_id}/download` | download link |
| `GET /api/astronauts/{id}/symptom-reports?since&until&limit` | Symptoms tab, report |

**Writes** (always with header `X-Actor`)

| Call | Body |
|---|---|
| `PUT /api/astronauts/{id}` | `name, gender, birth_date, weight_kg, agency, baseline_hr, baseline_bp_systolic, baseline_bp_diastolic, dxa_t_score, oct_notes, prior_radiation_msv` (what is left out does not change) |
| `PUT /api/astronauts/{id}/exercise-goals` | `ared_sessions_per_week, ared_minutes_per_session, notes` |
| `POST /api/astronauts/{id}/records` | multipart form: `file` (CSV, up to 2 MB) and optional `note` |

**Defined in `earthApi.js` but not used by the current screens:** `thresholds`, `putThresholds`, `exerciseGoals`,
`manual`, `context`, `levelHistory`, `radiation`, `changes`, `link`, `variables`, `addNote`, `sendMessage`,
`allSymptomReports`. They are ready for future screens.

**Errors.** `request()` throws `ApiError` with `status` and a readable message: `0` no answer from the server,
`404` no data yet, `413` file too big, `422` invalid value (the message carries the backend's reason). Use
`describeError(error)` to show it.

---

## 7. Data formats

### Record CSV

Header `section,field,value,unit`, one row per data point, UTF-8, comma delimiter. Only filled fields are written.
Units are plain ASCII (`degC`, not `°C`) so spreadsheets do not garble them.

```csv
section,field,value,unit
Identification,astronaut_id,AST-04,
Identification,name,Ana Pérez,
Identification,agency,CSA,
Anthropometry and countermeasures,weight_kg,60,kg
Anthropometry and countermeasures,height_m,1.68,m
Anthropometry and countermeasures,daily_energy_requirement,1740,kcal/day
Pre-flight baseline (on Earth),baseline_hr,58,bpm
Pre-flight baseline (on Earth),baseline_core_temp_c,36.6,degC
```

The backend accepts **any** CSV (up to 2 MB, UTF-8 or Windows-1252, delimiter `,` `;` tab or `|`). This layout is a
convention of the team, not a requirement.

| Field | Goes to the profile (PUT) | Goes to exercise goals (PUT) | Only in the CSV |
|---|---|---|---|
| `astronaut_id` | (the URL) | | |
| `name`, `birth_date`, `gender`, `agency` | ✔ | | |
| `weight_kg`, `baseline_hr`, `baseline_bp_systolic`, `baseline_bp_diastolic`, `dxa_t_score`, `oct_notes`, `prior_radiation_msv` | ✔ | | |
| `ared_sessions_per_week`, `ared_minutes_per_session` | | ✔ | |
| `height_m`, `baseline_core_temp_c`, `dxa_hip`, `dxa_spine`, `dxa_legs`, `daily_energy_requirement` | | | ✔ |

### Dashboard (what the console reads)

`GET /api/astronauts/{id}/dashboard` returns, among others: `astronaut_id`, `measured_at`, `generated_at`,
`level`, `vitals[]` (each with `key, value, unit, level, no_signal, baseline`), `systems[]` (8 systems with
`level`), `environment` (`crew_state`, `mission_day`), `radiation`, `bone_loss_estimate_percent`,
`manual_latest` (`blood_pressure`, `glucose`, `phq9`, `gad7`), `findings[]`, `guides[]` and `data_quality`.
Real examples are in `public/mocks/earth/dashboard-AST-0x.json`.

### Symptom report (what the Symptoms tab and the report read)

`id`, `symptom` (pain, headache, nausea, dizziness, fatigue, fever, breathing_difficulty, chest_pain, vision,
mood, injury, other), `severity` (mild, moderate, severe), `body_area`, `description`, `reported_by`,
`reported_at`, `vitals` (object with the latest measurements at that moment). Optional fields that are missing
(`body_area`, `description`, `vitals`) are simply left out of the card.

---

## 8. Styling

- `src/theme.css` styles the Earth app; `src/earth/report.css` styles only the printable report. Both use plain CSS
  with variables, no framework.
- **Palette** (defined in `:root` of `theme.css`): night blue `#060e3d` (background), deep blue `#002456`
  (panels), border blue `#1b3f7a`, bone `#ece7da` (text), steel `#8fa2c4` (secondary text), console black
  `#03050d`, reds `#fe3938` and `#dd0000`, plus green `#34c38f`, yellow `#f4c542`, orange `#ff8a1f`.
- **Reds mean "critical".** They are the `red` level; do not use them as decoration.
- **Status colour comes from the backend.** Elements get `data-level="green|yellow|orange|red|unknown"` and CSS
  picks `--lv` from it. Inline colours (console entries) come from `t.levelColor(level)` in
  `shared/i18n-en.json`. These two sources use slightly different shades (for example `#34c38f` vs `#2FBF71`
  for green). If you want them identical, make `t.levelColor` read the CSS variables or copy the hex values.
- **Fonts**, installed from npm so they work offline: Chakra Petch (text) and IBM Plex Mono (numbers, labels),
  imported in `main.jsx`.
- Layout is a CSS grid on `.earth`; columns are `300px | 1fr | 340px`.
- The printable report is a light page; the dark theme is switched off for it (`body:has(.report-page)`) and the
  app's top bar is hidden.

---

## 9. Mock mode

`VITE_USE_MOCKS=true` makes `request()` read `public/mocks/<file>` instead of calling the server.

- `GET` calls read the file named in `earthApi.js` (for example `earth/dashboard-AST-03.json`). Writes do nothing
  and answer `{ mocked: true }`.
- The data is **static**: it does not move. There is no simulator in the frontend.
- Mocks exist only for some astronauts (dashboards for `AST-01`, `AST-02`, `AST-03`; profile for `AST-02`,
  `AST-03`; readings for `AST-03`). Asking for anything else answers "Mock not found".
- There are no mocks for records or symptom reports, so those panels show an error in this mode.
- The mocks are real backend answers exported to JSON; see `public/mocks/README.md` for how they were made.

Use real mode (`VITE_USE_MOCKS=false`) whenever the backend is reachable.

---

## 10. Rules of the project

1. **The backend decides status and colour.** Every answer carries `level` and `status`. The frontend only paints.
   Never compare a number with a threshold in the frontend: ranges depend on the astronaut (personal thresholds)
   and on the activity.
2. **`null` is not zero.** A sensor without signal sends `null` (`no_signal: true` in the dashboard). Show
   "no data" / "no signal", never the old value, and leave gaps in charts.
3. **Poll, do not push.** No WebSocket. Use `usePolling`; keep the last data when a request fails and warn.
4. **Earth is delayed on purpose.** Judge freshness by the time of the data (`measured_at`), not by the clock.
5. **Say who is acting.** Every write sends `X-Actor` (`VITE_ACTOR`).
6. **Errors explain themselves.** Show the reason of a `422`; `404` means "no data yet"; status `0` means no answer.
7. **English everywhere**: UI text, identifiers and comments. Texts for keys sent by the API live in
   `shared/i18n-en.json`; an unknown key is returned as the key itself and never breaks a screen. Some
   clinical sentences (`findings[].advice`, `guides`) come from the backend.
8. **No secrets or addresses in code.** The server address lives in `.env`.

---

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `Port 5173 is already in use` | The Docker `frontend` container or another Vite is running. `docker compose down` (from the repo root) or `kill $(lsof -ti :5173)`. |
| Blank page, console says a module "does not provide an export" | An import points at a file or function that no longer exists. Check the first error in the browser console. |
| `Failed to resolve import "./X.jsx"` | The file is missing or has a different name. File names are case-sensitive on Linux and in Docker (`recordCsv.js`, not `RecordCsv.js`). |
| `/earth` on the backend IP gives an error page | `/earth` is a route of this frontend, not of the API. Open `http://localhost:5173/earth`. The API only serves `/api/...`. |
| Data does not load, console shows CORS | The backend must allow origin `http://localhost:5173`, header `X-Actor` and methods `PUT`/`POST`. Restart the backend after changing it. |
| Changed `.env` and nothing happened | Restart Vite. |
| "No connection to the server" banner | Wrong or old IP (hotspot changed), backend down, or firewall. Test with `curl` (see [Configuration](#2-configuration)). |
| One astronaut's data does not update | Seed astronauts (`AST-01`..`AST-03`, `AST-92`) only change when the simulator or someone posts packets. `A001`..`A003` are a built-in demo that updates by itself. Compare `latest.timestamp` with `date -u`. |
| Sleep, SpO₂ or radiation show "no data" for `A001`..`A003` | The demo generator never sends those fields. The data does not exist at the source; the frontend is correct. |
| NO RECENT DATA tag | Last packet is older than 60 s. Normal with high link latency or no source. |
| New astronaut does not appear | Check the form's error message; the write may have been refused (`422`). Confirm with `curl .../api/astronauts`. |
| Record upload fails with 413 / 422 | File larger than 2 MB, or not a text CSV. |
| Report has no colours when printed | Enable "Background graphics" in the print dialog. |
| Excel shows odd characters in a downloaded CSV | Names with accents are UTF-8. In Excel use "Data → From text/CSV" and choose UTF-8. The in-app table shows them correctly. |

---

## 12. Known limitations and ideas

- **No roles or login.** Anyone with the link sees every astronaut and can register or edit them. Agencies should
  not see each other's crews; this is out of scope for the hackathon and is the first thing to add.
- **Profile and record file duplicate data.** The backend does not import the CSV into the profile. A backend
  import endpoint would remove the duplication.
- **Cannot clear a profile field** from the form (empty fields are not sent).
- **Personal thresholds editor** (`ThresholdsEditor`) is built but not mounted: thresholds were redefined in the
  team's indicators document and are applied by the backend.
- **PDF** is saved through the print dialog. A direct download would need a PDF library.
- **Report signs selector:** the page already accepts `&signs=...`; there is no multiselect UI yet.
- **Alerts** show the last 200 only.
- **Status colours** have two slightly different shades (CSS variables vs dictionary).
- `i18n-es.json` and the original scaffold pages are unused leftovers.
- Not covered: automated tests, accessibility review, phone layouts.

---

## 13. How to extend it

**Add a line to the console.** In `ConsolePanel.jsx`, `telemetryBlock()` builds the entries of a packet and
`manualEntries()` the pinned captures. Push `line(key, time, "LABEL", value, color)`; take the colour from the
backend level (`t.levelColor(level)`).

**Add a chart section to the report.** Add `{ title, keys }` to `SECTIONS` in `ReportPage.jsx`. The keys must be
column names of `GET /readings`; units and labels come from `shared/i18n-en.json` (`indicators`).

**Add a field to the registration form and CSV.** Add it to `SECTIONS` in `recordCsv.js`. Give it `profile: "api_key"`
if the backend profile accepts it, `goal: "api_key"` if it belongs to exercise goals, or neither to keep it only in
the CSV. The form, the CSV builder, the template and the request bodies are generated from that list.

**Add an API call.** Add one line to `earthApi.js` (`get(path, mockFile)` for reads, `send(method, path, body, actor)`
for writes) and use it with `usePolling` or directly. Add the mock file under `public/mocks/earth/` if you want it
in mock mode.

**Add or change a UI text for an API key.** Edit `shared/i18n-en.json`.

**Before calling something done, check:**

- [ ] The list shows everyone, worst first, with the backend colour.
- [ ] The console adds a block only when a packet arrives and never shows an old value as current.
- [ ] A lost sensor prints `no signal` and leaves a gap in charts.
- [ ] A write sends `X-Actor`, shows "pending delivery" and shows the backend's reason when refused.
- [ ] The report validates dates, handles an astronaut without data and prints cleanly as PDF.
- [ ] Everything user-facing is in English.