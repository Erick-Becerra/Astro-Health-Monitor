# Contract of the three apps

Three apps, three sets of permissions. Each one talks to the server it belongs to.
Interactive documentation of every endpoint (with a "Try it out" button):

| App | Talks to | Docs |
|---|---|---|
| **App 1** Earth monitoring (mission control, medical officer) | Earth base `http://<HOST_IP>:8000` | `/docs` on that address |
| **App 2** Astronaut console (offline-first) | Space station `http://<HOST_IP>:8001` | `/docs` on that address |
| **App 3** Sensor simulator | Space station `http://<HOST_IP>:8001` | `/docs` on that address |

```
 App 3 simulator ──packet──► station (:8001) ◄── App 2 astronaut console
                                │   ▲
                       uplink   │   │  profile, rules, notes
                (after latency) ▼   │  (after latency)
                              Earth (:8000) ◄── App 1 Earth monitoring
```

The station works on its own: App 2 and App 3 keep working if Earth is down. Everything
is stored on the station first and uploaded when there is a link, held back by the link
latency (Moon 2.6 s, Mars up to 44 min). Earth's edits travel the other way the same way.

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

## Frontend kit

[frontend/README.md](frontend/README.md) has what the front team needs to build the three apps: an English dictionary for
every key the API sends, an API client, a polling hook, the screens as working examples, the simulator's packet builder
and scenarios, and a ready-to-paste prompt for the assistant of each team (one for the Station pack, one for the Earth pack).

## Mocks (work without the backend)

`docs/mocks/` has real responses of every endpoint as JSON files, and the packets of the simulator, so the
frontends can be built without waiting for anyone. `docs/mocks/README.md` explains how to switch between mocks and
the real API. They are regenerated with `python scripts/export_mocks.py` when the contract changes.

---

## App 3: sensor simulator, sends to the station

A step-by-step guide to connect it, with code examples, is in [simulator/README.md](simulator/README.md)
(to hand to whoever builds the simulator).

### `POST http://<HOST_IP>:8001/api/sim/packet`

The packet of the JSON schema **v1.1** (`astro-health-monitor/schemas/telemetry-v1.1.json`):

```json
{
  "schema_version": "1.1",
  "header": {"packet_id": "TLM-20261114-0042", "astronaut_id": "AST-01",
             "measured_at": "2026-11-14T17:30:00Z", "source": "automated_sensor_stream"},
  "mission_context": {"activity_state": "resting", "comm_latency_sec": 2.6,
                      "environment": {"cabin_co2_mmhg": 2.4}},
  "biometrics": {
    "cardiovascular": {"heart_rate_bpm": 68, "blood_pressure_systolic_mmhg": 118,
                       "blood_pressure_diastolic_mmhg": 76, "sensor_hardware": "Bio-Monitor ECG",
                       "signal_quality": "good"},
    "respiratory": {"spo2_percent": 98, "respiratory_rate_rpm": 14, "sensor_hardware": "Pulse Oximeter",
                    "signal_quality": "good"},
    "thermoregulation": {"core_temp_c": 37.1, "sensor_hardware": "Double Sensor Forehead",
                         "signal_quality": "good"}},
  "daily_assessment": null,
  "radiation_dosimetry": {"daily_rate_msv": 0.42,
                          "solar_particle_event": {"active": false, "event_dose_msv": 0.0},
                          "sensor_hardware": "RAD / Liulin Active Dosimeter", "signal_quality": "good"}
}
```

Answer `201`: `{"stored", "astronaut_id", "timestamp", "packet_id", "level", "status", "findings",
"radiation_dose_msv", "changed", "signal_quality"}`; `changed` lists the variables whose change was
written to the change log.

**How a packet is read**

| In the packet | What the station does |
|---|---|
| A section or field is **absent** | No change: the variable keeps its last value (so a slider can send only what it moved) |
| A field is **`null`** | The sensor has no reading: the last value is **cleared** (it is not shown as current) |
| `signal_quality: "lost"` | Clears every value of its group. The console flags the sensor and the heart / lungs / temperature system turns yellow |
| `signal_quality: "degraded"` | Keeps the values and flags them as less reliable |
| `daily_assessment: null` | No assessment in this packet |
| `mood_assessment` (PHQ-9 + GAD-7: `item_scores`, `total`, `item9_positive`) | Stored as questionnaires, classified by the backend (Normal / Caution / Moderate risk / Critical); item 9 above 0 is always Critical. The response has a `mood` block with score, severity and level |
| Unknown keys | Ignored |
| `schema_version` other than `"1.1"`, unknown `source`, `activity_state` or `signal_quality`, a value out of range | `422` with the reason |

| Packet field | Our variable | Notes |
|---|---|---|
| `header.measured_at` | time of the reading | Missing = now. One packet per astronaut per second: two with the same second replace each other |
| `header.packet_id`, `header.source` | `packet_id`, `meta.source` | `source`: `automated_sensor_stream`, `periodic_device_trigger`, `manual_override` |
| `mission_context.comm_latency_sec` | `link_latency_seconds` | Also changes the real link delay (logged when it changes) |
| `mission_context.activity_state` | `crew_state` | `resting`, `sleeping`, `working`, `exercising`, `post_exercise_recovery`, `eva` (see below) |
| `environment.cabin_co2_mmhg` | `cabin_co2_mmhg` | Yellow from 2.3, orange from 2.7, red from 3.0. `null` = no reading |
| `cardiovascular.heart_rate_bpm`, `blood_pressure_*_mmhg` | `heart_rate`, `blood_pressure_systolic/diastolic` | The crew can also type blood pressure by hand; the most recent one is shown |
| `respiratory.*` | `spo2`, `respiratory_rate` | |
| `thermoregulation.core_temp_c` | `body_temperature` | |
| `daily_assessment.sleep_hours_last_night`, `pvt_reaction_time_ms` | `sleep_hours`, `pvt_b_ms` | `assessment_date` is kept with the reading |
| (computed) | `consecutive_nights_under_6h` | The station counts nights under 6 h in a row from the daily assessments |
| `radiation_dosimetry.daily_rate_msv` | `radiation_rate_msv_day` | Nominal 0.2 to 0.5 |
| (computed) | `radiation_dose_msv` | The packet does not carry the accumulated dose: the station **adds up the rate over time** (see below) |
| `solar_particle_event.active` / `event_dose_msv` | `spe_active` / `spe_event_dose_msv` | Active = solar-event alert, red from 250 mSv |
| `sensor_hardware`, `signal_quality` (each group) | `meta.sensors`, `meta.signal_quality` | Kept for traceability and for the data-quality panel |

**What counts as normal depends on the activity.** A heart rate of 150 is normal while exercising and
an emergency at rest. The edges of the ranges move with `activity_state`:

| State | Higher limits move up by (heart rate, breathing, temperature, systolic) |
|---|---|
| `resting` | no change |
| `working` | heart rate +10 |
| `exercising` | +60 bpm, +14 rpm, +0.8 °C, +35 mmHg |
| `post_exercise_recovery` | +45 bpm, +10 rpm, +0.7 °C, +30 mmHg |
| `eva` | +30 bpm, +8 rpm, +0.4 °C, +10 mmHg |
| `sleeping` | the **lower** limits move down (heart rate 10, breathing 2, temperature 0.3), because it is normal to be slower while asleep |

**Radiation.** The station adds `daily_rate_msv x time between packets / 1 day x time_scale` to the
accumulated dose. With `time_scale` 1 that is almost nothing in a demo, so raise it (`PUT /api/sim/mission`)
to see the budget meter move, and set the starting point with `PUT /api/sim/astronauts/{id}/radiation`.
A solar particle event adds only the part of its dose not counted yet (100 then 250 adds 250, not 350).

The simulator may also send the same packet to Earth: `POST http://<HOST_IP>:8000/api/telemetry/packet`.
The copy that arrives later through the station is ignored. Prefer the station.

### Other calls of App 3

| Call | What it does |
|---|---|
| `POST /api/sim/events/solar` `{"astronaut_id": "AST-01", "dose_msv": 250}` | Solar particle event: adds the dose and raises the alert. No `astronaut_id` = whole crew |
| `DELETE /api/sim/events/solar?astronaut_id=AST-01` | Ends the event |
| `PUT /api/sim/astronauts/{id}/radiation` `{"mission_dose_msv": 32.76}` | Sets the dose accumulated so far, without moving the astronaut's clock |
| `GET /api/sim/mission` | Mission clock and link |
| `PUT /api/sim/mission` `{"mission_day": 78, "link_latency_seconds": 2640, "time_scale": 1, "link_up": true, "builtin_simulator": false}` | Mission day (v1.1 packets do not carry it), latency, radiation time scale, link on/off. Leave out what you do not change |

Set `builtin_simulator` to `false` when App 3 is the only source of data (otherwise the demo
simulator keeps generating A001 to A003 on its own; it already leaves alone any astronaut that App 3 is driving).

---

## App 2: astronaut console, talks to the station

### Writes (inputs of the astronaut)

| Call | Body | Result |
|---|---|---|
| `POST /api/crew/{id}/blood-pressure` | `{"systolic": 132, "diastolic": 84}` | Level and advice |
| `POST /api/crew/{id}/glucose` | `{"value": 92, "context": "fasting"}` (`fasting` or `postprandial`) | Level and advice (below 70: take 15 g of fast carbohydrates) |
| `POST /api/crew/{id}/phq9` | `{"answers": [1,1,0,1,0,1,0,0,1]}` 9 answers, 0 to 3 | `score`, `severity`, `item9_alert`. **Item 9 above 0 raises a red alert on the spot**: guidance in the station inbox and alert on Earth |
| `POST /api/crew/{id}/gad7` | `{"answers": [2,2,1,2,1,2,2]}` 7 answers, 0 to 3 | `score`, `severity` |
| `POST /api/crew/{id}/log` | `{"type": "headache", "note": "optional"}` | Countermeasure or symptom log. `type`: `carbs_15g`, `ared_session`, `radiation_shelter`, `headache`, `blurred_vision`, `other` |

All accept an optional `captured_at`. Each capture is stored, added to the change log and uploaded to Earth.

For the PHQ-9 and the GAD-7 there is a richer way, where **the front works out the result and the backend keeps the
whole JSON**: `POST /api/crew/{id}/questionnaires`, described in [Saved questionnaires](#saved-questionnaires-phq-9-and-gad-7).
The two endpoints above (answers only) keep working.

### Reads

| Call | What you get |
|---|---|
| `GET /api/crew/{id}/dashboard` | **Everything the console shows, in one call** (below) |
| `GET /api/crew/{id}/manual?kind=glucose&limit=50` | History of the astronaut's captures |
| `GET /api/crew/{id}/questionnaires` and `/{questionnaire_id}` | The saved PHQ-9 / GAD-7, each with the JSON the front sent |
| `GET /api/messages?astronaut_id={id}&unread_only=true` | Guidance, notes and prescriptions from Earth. `POST /api/messages/{id}/ack` marks one as read |
| `GET /api/crew/{id}/config` | Profile, baseline, thresholds and goals received from Earth (with their version) |
| `GET /api/status` | Link, latency, mission day and how much is waiting to be uploaded |
| `GET /api/changes?astronaut_id={id}` | Change log of the station |

### `GET /api/crew/{id}/dashboard`

```json
{
  "astronaut_id": "AST-03", "generated_at": "...", "level": "red", "status": "critical",
  "environment": {"cabin_co2_mmhg": 2.06, "crew_state": "resting", "mission_day": 78},
  "vitals": [
    {"key": "heart_rate", "label": "Heart rate", "unit": "bpm", "value": null, "source": null,
     "signal_quality": "lost", "no_signal": true, "baseline": 60.0, "vs_baseline": null, "level": null},
    {"key": "blood_pressure_systolic", "label": "Systolic pressure", "unit": "mmHg", "value": 150.0,
     "source": "manual", "signal_quality": null, "no_signal": false, "baseline": 110.0, "vs_baseline": 40.0,
     "level": "yellow"}
  ],
  "data_quality": [{"group": "cardiovascular", "label": "Heart and blood pressure sensor", "quality": "lost",
                    "sensor": "Bio-Monitor ECG", "variables": ["heart_rate", "blood_pressure_systolic", "..."]}],
  "manual_latest": {
    "glucose": {"value": 88.0, "context": "fasting", "level": "green", "captured_at": "..."},
    "phq9": {"score": 12, "severity": "moderate", "item9_alert": true, "level": "red", "captured_at": "..."},
    "gad7": {"score": 16, "severity": "severe", "level": "red", "captured_at": "..."},
    "blood_pressure": {"systolic": 150.0, "diastolic": 96.0, "level": "yellow", "captured_at": "..."}
  },
  "radiation": {"agency": "CSA", "career_limit_msv": 1000, "prior_msv": 40.0, "mission_msv": 41.3,
                "total_msv": 81.3, "percent_of_limit": 8.13, "rate_msv_day": 0.42,
                "solar_event_threshold_msv": 250, "solar_event_alert": false, "last_solar_event_at": null},
  "bone_loss_estimate_percent": 2.6,
  "systems": [
    {"system": "brain", "label": "Brain and behavior", "hazard": "Isolation and confinement", "level": "red",
     "drivers": [{"indicator": "phq9_item9", "label": "PHQ-9 item 9", "value": 1, "unit": "", "level": "red"}]}
  ],
  "guides": [{"id": "phq9_item9", "title": "PHQ-9 item 9", "level": "red", "steps": ["..."]}],
  "findings": [{"indicator": "phq9_item9", "level": "red", "advice": "...", "source": "manual"}]
}
```

- **`systems`** feeds the anatomical map: `heart`, `lungs`, `brain`, `metabolism`, `thermal`, `radiation`,
  `bones`, `eyes`, each with its `level` (the colour), the NASA `hazard` it is linked to and the `drivers`
  that explain the colour. `level` at the top is the worst of them.
- **`vitals`** is the unified reading: telemetry crossed with the latest manual captures (`source` says which;
  blood pressure shows the most recent of the sensor and the crew's) and the pre-flight baseline (`vs_baseline`).
  A sensor without signal has `value: null` and `no_signal: true`: never show the old number.
- **`data_quality`** lists the sensors with `lost` or `degraded` signal.
- **`radiation`** is the budget meter (`percent_of_limit`) and the solar-event alert.
- **`guides`** are the immediate-action protocols, ordered from the worst. They work with no answer from Earth.

---

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

## Saved questionnaires (PHQ-9 and GAD-7)

The **front builds the questions** and works out the score, the severity and the recommendation. The backend **keeps what
the front sends, whole, as long text** (a `TEXT` column of PostgreSQL: no length limit besides the 200 KB the API accepts),
and makes it available to read later. It does not need the text of the questions: if the front wants them kept, it puts
them in the JSON.

### Save: `POST http://<HOST_IP>:8001/api/crew/{astronaut_id}/questionnaires`

The body is the JSON of the questionnaire. These fields are required, and anything else is kept exactly as it comes:

| Field | What it is |
|---|---|
| `questionnaire` | `phq9` or `gad7` |
| `answered_by` | Name of the person who answered |
| `answers` | The scored answers: **9** for the PHQ-9, **7** for the GAD-7, each `0` to `3` |
| `score` | The total: it must be the **sum of `answers`** |
| `severity` | The severity as the front writes it (for example `"Moderate"`) |
| `recommendation` | The recommendation as the front writes it |
| `answered_at` | Optional, ISO 8601 UTC: when it was answered (default: now) |

```json
{
  "questionnaire": "phq9", "answered_by": "Sofía Navarro", "answered_at": "2026-11-14T08:15:00Z",
  "answers": [2, 2, 1, 2, 1, 2, 1, 1, 0], "score": 12, "severity": "Moderate",
  "recommendation": "Follow-up plan with the behavioral health team.",
  "language": "en-US", "items": [{"n": 1, "question": "...", "answer": 2}]
}
```

Answer `201`: the saved record (`id`, `astronaut_id`, `questionnaire`, `answered_by`, `score`, `severity`, `answered_at`,
`uplinked_at`) with the JSON that was kept in **`response`**, plus `level` (green to red), `item9_alert` and `findings`.

| Code | When |
|---|---|
| `422` | The JSON is not coherent: wrong number of answers, an answer outside 0 to 3, a score that is not the sum, a missing required field, an empty name, a body that is not a JSON object. The `detail` says which |
| `409` | A questionnaire of that type was already saved for that astronaut at exactly that `answered_at` |
| `413` | The JSON is larger than 200 KB |

The backend checks the numbers only so that a bug of the screen does not become a wrong clinical record: it does not
write the severity or the recommendation.

**Colours and the item 9 alert keep working.** The answers also count as a manual capture of the astronaut, so the
dashboard (`manual_latest`, the brain system) and the PHQ-9 **item 9 alert** react exactly as with the old endpoints.
Question 9 above 0 answers `item9_alert: true` and puts a guidance in the station inbox.

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
