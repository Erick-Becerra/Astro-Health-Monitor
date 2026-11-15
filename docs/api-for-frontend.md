# API guide for the frontend

> **Building one of the three apps** (Earth monitoring, astronaut console, simulator)? Read
> [apps-contract.md](apps-contract.md) first: it has the endpoints of each app, the sensor packet
> format and the change log. This guide covers the original Earth endpoints.

You only need to call **one server**: the Earth base. Everything below was
captured from the real running API.

```
BASE = http://<HOST_IP>:8000        (ask the backend person for HOST_IP)
```

- Interactive docs, where you can try every call: `http://<HOST_IP>:8000/docs`
- You do **not** need Docker. Run your frontend however you like, on any port.
- CORS is open for `localhost` and private network addresses (192.168.x.x,
  10.x.x.x, 172.16-31.x.x) on any port.
- Quick check: open `BASE/api/health` in your browser. It must say `"status":"ok"`.
- There is no login. Times are ISO 8601 in UTC (`2026-11-14T15:06:24+00:00`).
- The data changes every ~2 seconds. **Poll every 2 to 3 seconds** (`setInterval`).

## Status values

`status` is always one of: `ok`, `attention`, `critical` (and `unknown` for an
astronaut with no readings yet). Suggested colours: green, amber, red, grey.

## Endpoints

| What you need | Call |
|---|---|
| Home screen: every astronaut + latest status | `GET /api/astronauts` |
| One astronaut: latest reading + what is wrong + what to do | `GET /api/astronauts/{id}` |
| Chart history (oldest first) | `GET /api/astronauts/{id}/readings?limit=100` (max 1000) |
| Alerts feed | `GET /api/alerts?limit=50` or `&astronaut_id=A002` |
| Link with the station (blackout, delay) | `GET /api/station` |
| Flight surgeon writes to an astronaut | `POST /api/astronauts/{id}/messages` |

### `GET /api/astronauts`

```json
[
  {
    "astronaut_id": "A002",
    "name": "Valentina Soto",
    "gender": "female",
    "first_seen": "2026-11-14T14:56:08.062451+00:00",
    "latest": {
      "timestamp": "2026-11-14T15:06:24+00:00",
      "received_at": "2026-11-14T15:06:27.481139+00:00",
      "heart_rate": 89.5,
      "body_temperature": 37.91,
      "blood_pressure_systolic": 124,
      "blood_pressure_diastolic": 70,
      "status": "attention"
    },
    "status": "attention"
  }
]
```

`latest` is `null` and `status` is `"unknown"` until the first reading arrives.
`name` is the astronaut's name (`null` if it was never set: then show `astronaut_id`).
The demo crew has made-up names: A001 Mateo Rojas, A002 Valentina Soto, A003 Camila Reyes.

`gender` is `"female"`, `"male"` or `"other"` (or `null` if it was never set).
In the demo crew: A001 is `male`, A002 and A003 are `female`. Use it for the
body figure or the profile card. The ranges that decide `status` do **not**
depend on gender yet.

The profile can be changed with `PUT /api/astronauts/{id}` and a body such as
`{"gender": "female"}` (or `{"name": "..."}`). Fields you leave out stay as they were.

### `GET /api/astronauts/{id}`

Same as above plus `findings`: one entry per indicator that is **not** ok.
This is what feeds the "what is wrong / what to do" panel. It is empty when
everything is ok. Returns 404 for an unknown id.

```json
{
  "astronaut_id": "A002",
  "latest": {
    "timestamp": "2026-11-14T15:06:24+00:00",
    "heart_rate": 89.5,
    "body_temperature": 37.91,
    "blood_pressure_systolic": 124.0,
    "blood_pressure_diastolic": 70.0,
    "status": "attention",
    "findings": [
      {
        "indicator": "body_temperature",
        "label": "Body temperature",
        "value": 37.91,
        "unit": "°C",
        "status": "attention",
        "advice": "Raised temperature. Rest, hydrate and measure again in 30 minutes."
      }
    ]
  }
}
```

`indicator` is one of `heart_rate`, `body_temperature`,
`blood_pressure_systolic`, `blood_pressure_diastolic`. Use it as the key to
colour a body region (for example heart for `heart_rate`).

### `GET /api/astronauts/{id}/readings`

An array, **oldest first**, ready for a chart. Each item has `timestamp`,
`received_at`, the four values and `status` (no `findings`).

| Parameter | Meaning |
|---|---|
| `limit` | The newest `limit` rows of the range. Default 100, max 5000 |
| `since`, `until` | Time range, ISO 8601 (for example `2026-11-14T08:00:00Z`) |
| `bucket_seconds` | Average the readings into buckets (`300` = one point per 5 minutes). Each bucket keeps the **worst** status inside it |

Typical calls:

```
Live view, last minutes:  /api/astronauts/A002/readings?limit=60
Last 6 hours, 5 min dots: /api/astronauts/A002/readings?since=2026-11-14T09:00:00Z&bucket_seconds=300&limit=5000
```

Live readings arrive every 2 seconds, so a long range without `bucket_seconds`
returns thousands of points. Use `bucket_seconds` for anything over an hour.

## Test data

Every astronaut already has about 6 hours of demo history before the live data,
with episodes that cover all three statuses:

| Astronaut | What happens |
|---|---|
| A001 | Mostly ok, a solar storm (stress) around 3 hours in, then a low body temperature (critical) late in the history |
| A002 | Fever: temperature rises to critical for about 2 hours, then recovers |
| A003 | High blood pressure early on, then a fast pulse (critical) near the end |

The history ends where the live data begins, and the alerts in it are dated at
the moment each one happened. The backend person can load it again on a fresh
database with `docker compose exec -T earth-base python seed_demo.py`
(running it twice is harmless).

### `GET /api/alerts`

Newest first. An alert is created when an astronaut gets **worse** (ok to
attention, attention to critical), not on every reading.

```json
[
  {
    "id": 2,
    "astronaut_id": "A002",
    "name": "Valentina Soto",
    "gender": "female",
    "created_at": "2026-11-14T15:06:22.385094+00:00",
    "severity": "attention",
    "summary": "A002: Body temperature 37.62 °C",
    "guidance": "Raised temperature. Rest, hydrate and measure again in 30 minutes.",
    "sent_to_station_at": "2026-11-14T15:06:24.512867+00:00"
  }
]
```

`id` is unique and always grows, so use it as the list key (`key={alert.id}` in
React) and to detect new alerts: remember the highest `id` you have seen and
treat anything above it as new. You do not have to show it.

### `GET /api/station`

Link state, useful for a "Station link" badge. If the station is stopped this
returns 502.

```json
{
  "link_up": true,
  "link_delay_seconds": 3.0,
  "readings_waiting_for_uplink": 6,
  "last_uplink": "2026-11-14T15:06:27.932322+00:00",
  "last_error": null,
  "crew": ["A001", "A002", "A003"],
  "scenarios_running": [{"astronaut_id": "A002", "scenario": "fever", "seconds_left": 281}]
}
```

When `link_up` is `false` (a blackout) the data on screen stops updating and
`readings_waiting_for_uplink` grows. When the link returns, all of it arrives
at once. Showing that is a good demo moment.

### `POST /api/astronauts/{id}/messages`

Body: `{"body": "Please repeat the measurement.", "severity": "info"}` where
severity is `info`, `attention` or `critical`. Answers `{"queued": true, "deliver_at": "..."}`:
the message reaches the station after the link latency (and waits there if the link is down).

## Example (plain JavaScript)

```js
const BASE = "http://192.168.1.20:8000"; // the backend person's address

async function refresh() {
  const astronauts = await (await fetch(`${BASE}/api/astronauts`)).json();
  for (const a of astronauts) {
    console.log(a.astronaut_id, a.status, a.latest?.heart_rate);
  }
}
refresh();
setInterval(refresh, 2000);
```

## Making something happen (for the demo)

The backend person runs these on their computer (or you can, with the host
address). They change what the frontend receives:

| Do | Call |
|---|---|
| Fever on A002 for 2 minutes | `POST http://<HOST_IP>:8001/api/scenarios` with `{"astronaut_id":"A002","scenario":"fever","seconds":120}` |
| Other scenarios | `tachycardia`, `hypertension`, `hypothermia`, `solar_storm` |
| Back to normal | `DELETE http://<HOST_IP>:8001/api/scenarios` |
| Cut / restore the link | `POST http://<HOST_IP>:8001/api/link` with `{"up": false}` or `{"up": true}` |
| Send a reading by hand | `POST http://<HOST_IP>:8001/api/readings`, format in [data-format.md](data-format.md) |

## Notes

- Alert thresholds are placeholders until `docs/indicators.md` is filled in.
  Do not hard-code ranges in the frontend: use `status` and `findings`.
- If `BASE` stops answering, the host's IP may have changed (new Wi-Fi or
  hotspot). Ask the backend person for the new address.
