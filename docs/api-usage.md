# API usage

What the frontend calls and sends. The servers themselves are described in the ground team's pack
(`frontend/src/earth/README.md`) and in each server's own `/docs` page.

Two servers are used. Their addresses are `VITE_EARTH_URL` (default port 8000) and `VITE_STATION_URL` (default port
8001). Every write sends the header `X-Actor` with the value of `VITE_ACTOR`.

## Earth server (reads)

| Call | Used for |
|---|---|
| `GET /api/astronauts` | Astronaut list with name, gender, latest reading and `overall_level` |
| `GET /api/astronauts/{id}/dashboard` | Everything of one astronaut: 8 `systems`, `vitals`, `manual_latest`, `radiation`, `guides`, `findings`, `data_quality`, `level`, `status` |
| `GET /api/alerts?astronaut_id={id}&limit={n}` | Alert feed and history, newest first |

`earthApi.js` also defines readings, thresholds, outbox, link state and other calls that the current interface does not
use.

### Fields the interface depends on

- `dashboard.level` and `systems[].level`: one of `green`, `yellow`, `orange`, `red` (or `null`).
- `systems[].drivers[]`: `indicator`, `value`, `level`. Indicators starting with `signal_` are sensor signal loss.
- `vitals[]`: `key`, `value`, `level`, `no_signal`. The keys used are `heart_rate`, `body_temperature`,
  `blood_pressure_systolic`, `blood_pressure_diastolic`, `sleep_hours` and the others of the cards.
- `manual_latest`: `glucose`, `phq9`, `gad7`, each with its `level`.
- `radiation`: `percent_of_limit`, `total_msv`, `career_limit_msv`, `agency`, `solar_event_alert`.
- `guides[]`: `id`, `steps[]`.
- Alerts: `id`, `created_at`, `astronaut_id`, `name`, `summary`, `severity`.

## Station server

### Questionnaires

| Call | Use |
|---|---|
| `GET /api/crew/{id}/questionnaires?limit=50` | Past results, newest first |
| `POST /api/crew/{id}/questionnaires` | Save a result |

The body is built by `buildPayload` in `lib/questionnaires.js`. It is always in English; `language` tells which language
the person was using.

```json
{
  "questionnaire": "phq9",
  "answered_by": "Mateo Rojas",
  "answered_at": "2026-11-15T15:30:00.000Z",
  "answers": [1, 1, 0, 1, 0, 1, 1, 0, 0],
  "score": 5,
  "severity": "Mild",
  "recommendation": "Watchful waiting; repeat PHQ-9 at follow-up",
  "schema_version": 1,
  "version": "PHQ-9",
  "language": "es",
  "title": "Depression (PHQ-9)",
  "astronaut_id": "A001",
  "severity_key": "mild",
  "max_score": 27,
  "average": 0.56,
  "item9_alert": false,
  "items": [{ "n": 1, "question": "Little interest or pleasure in doing things", "answer": 1, "answer_label": "Several days" }]
}
```

The first seven fields are the ones the station requires; the rest is stored as sent. When a result is read back,
`parseResponse` rebuilds the texts (title, severity, treatment, questions) from the questionnaire definition in the
language on screen and uses the stored text only as a fallback.

### Symptom report

`POST /api/crew/{id}/symptom-report`

```json
{
  "symptom": "headache",
  "severity": "moderate",
  "body_area": "head",
  "description": "Free text, as long as needed",
  "reported_by": "name"
}
```

| Field | Type | Notes |
|---|---|---|
| `symptom` | enum, required | `pain`, `headache`, `nausea`, `dizziness`, `fatigue`, `fever`, `breathing_difficulty`, `chest_pain`, `vision`, `mood`, `injury`, `other` |
| `severity` | enum, required | `mild`, `moderate`, `severe` |
| `body_area` | string or null | Up to 40 characters. The form sends `head`, `chest`, `abdomen`, `back`, `arm`, `leg`, `eyes`, `general` |
| `description` | string or null | Up to 4000 characters |
| `reported_by` | string or null | Up to 80 characters; the server defaults to the `X-Actor` header |

The server also accepts an optional `reported_at` (date-time), which the form does not send. Empty optional fields are
sent as `null`.

## Errors

| Situation | What the interface does |
|---|---|
| No answer from a server (`status 0`) | Shows the connection toast and keeps the last data |
| `404` | The astronaut has no data yet; nothing is shown as an error |
| `422` on a write | Shows the reason sent by the server inside the form |
