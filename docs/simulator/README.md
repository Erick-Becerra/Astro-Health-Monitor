# How to connect the sensor simulator (App 3)

This guide is everything the person building the simulator needs to send data to the system. The simulator **only
sends**: it does not have to read anything back (although it can, to verify).

## 1. Where it connects

The simulator sends to the **space station**. The station stores everything and uploads it to Earth on its own, after the
link latency. There is no need to send to Earth.

| Item | Value |
|---|---|
| Address | `http://<IP>:8001` (the IP of the computer running the backend; currently `172.20.10.2`) |
| Packet submission | `POST /api/sim/packet` |
| Authentication | None (no key or token) |
| Headers | `content-type: application/json` and, recommended, `X-Actor: <who is moving the controls>` |
| Body | The v1.1 schema packet (section 3) |
| Success response | `201` with `{"stored": true, "level": "...", "status": "..."}` |

**The IP changes** if the "iPhone Seber" hotspot restarts. Keep it in a single place in your code (an environment
variable or a config setting) and ask for it again if it stops responding.

**Before sending, check the connection.** From the simulator machine, open in a browser or with curl:

```
http://<IP>:8001/api/health
```

It must respond `{"status":"ok","service":"space-station"}`. If it does not respond: the machine is not on the same hotspot,
the IP changed, or the firewall blocks port 8001 (see section 8).

## 2. What the simulator sends and what it does not

| Sent by the simulator (this guide) | Entered by the astronaut on their console (not the simulator's job) |
|---|---|
| Heart rate, blood pressure, SpO2, respiration, core temperature | PHQ-9 and GAD-7 (questionnaires) |
| Sleep and reaction time (daily assessment) | Glucose (glucometer) |
| Radiation rate and solar particle event | Symptom and action log |
| Cabin CO2, activity state, latency | |
| Signal quality of each sensor | |

The **color and status** (green, yellow, orange, red) **are not calculated by the simulator**: the backend calculates them
from what it receives. The simulator only sends the values.

## 3. The packet (schema v1.1)

This is a complete packet. Change `astronaut_id`, `packet_id` and, above all, **`measured_at` to the current time**.

```json
{
  "schema_version": "1.1",
  "header": {
    "packet_id": "TLM-20261114-0042",
    "astronaut_id": "AST-01",
    "measured_at": "2026-11-14T17:30:00Z",
    "source": "automated_sensor_stream"
  },
  "mission_context": {
    "activity_state": "resting",
    "comm_latency_sec": 2.6,
    "environment": { "cabin_co2_mmhg": 2.4 }
  },
  "biometrics": {
    "cardiovascular": {
      "heart_rate_bpm": 68,
      "blood_pressure_systolic_mmhg": 118,
      "blood_pressure_diastolic_mmhg": 76,
      "sensor_hardware": "Bio-Monitor ECG",
      "signal_quality": "good"
    },
    "respiratory": {
      "spo2_percent": 98,
      "respiratory_rate_rpm": 14,
      "sensor_hardware": "Pulse Oximeter",
      "signal_quality": "good"
    },
    "thermoregulation": {
      "core_temp_c": 37.1,
      "sensor_hardware": "Double Sensor Forehead",
      "signal_quality": "good"
    }
  },
  "daily_assessment": null,
  "radiation_dosimetry": {
    "daily_rate_msv": 0.42,
    "solar_particle_event": { "active": false, "event_dose_msv": 0.0 },
    "sensor_hardware": "RAD / Liulin Active Dosimeter",
    "signal_quality": "good"
  }
}
```

There are four ready-made example packets in `docs/mocks/simulator/`: `packet-normal.json`,
`packet-sensor-lost.json`, `packet-daily-assessment.json` and `packet-solar-event.json`.

### Fields and allowed values

| Field | What it is | Values |
|---|---|---|
| `header.astronaut_id` | Who it belongs to | Text of 1 to 32 characters, for example `AST-01`. The astronaut is created when the first data point arrives |
| `header.packet_id` | Packet identifier | Text, for traceability |
| `header.measured_at` | Time of the measurement | ISO 8601 in UTC (`2026-11-14T17:30:00Z`). Without a time zone it is read as UTC |
| `header.source` | Origin | `automated_sensor_stream`, `periodic_device_trigger`, `manual_override` |
| `activity_state` | What they are doing | `resting`, `sleeping`, `working`, `exercising`, `post_exercise_recovery`, `eva` |
| `comm_latency_sec` | Link latency with Earth | 0 to 2640 (Moon 2.6, Mars up to 2640) |
| `cabin_co2_mmhg` | Cabin CO2 | 0 to 50. Alert from 2.3, limit 3.0 |
| `heart_rate_bpm` | Heart rate | 20 to 250 |
| `blood_pressure_systolic_mmhg` / `diastolic` | Blood pressure | 40 to 260 / 20 to 160 |
| `spo2_percent` | Oxygen saturation | 50 to 100 |
| `respiratory_rate_rpm` | Breaths per minute | 4 to 60 |
| `core_temp_c` | Core temperature | 30 to 44 |
| `signal_quality` | Signal quality of that sensor | `good`, `degraded`, `lost` |
| `daily_assessment` | Daily assessment (sleep and reaction) | `null` or an object (section 5) |
| `mood_assessment` | PHQ-9 and GAD-7 questionnaires (sections 14 and 15 of the indicators document) | Absent or `null` = no questionnaire. Object: `assessment_date`, `phq9` `{item_scores: 9 values 0-3, total, item9_positive}`, `gad7` `{item_scores: 7 values 0-3, total}`. The `total` must be the sum; `item9_positive` must be `true` if item 9 is greater than 0. Otherwise, `422` |
| `daily_rate_msv` | Radiation rate | 0 or more. Normal in orbit: 0.2 to 0.5 |
| `solar_particle_event.active` / `event_dose_msv` | Solar particle event | `true/false` / dose in mSv. From 250 mSv it is an emergency |

## 4. How a packet is read

These rules matter most for the data to display correctly:

| If in the packet... | The station... |
|---|---|
| A section or a field is **missing** | Changes nothing: the value keeps its last data point. This way a slider can send only what it moved |
| A field is **`null`** | Clears that value (the sensor has no reading): the old data point is not shown |
| `signal_quality` is **`lost`** | Clears all values of that sensor. The console marks the sensor as no signal. Send `null` in its values |
| `signal_quality` is **`degraded`** | Keeps the values and marks them as less reliable |
| `daily_assessment` is `null` | Understands that this packet carries no daily assessment |
| It carries `mood_assessment` | Stores PHQ-9 and GAD-7 as manual entries, calculates the level and the guidance; item 9 > 0 is always Critical. Resending the same packet does not duplicate it |
| It carries unknown fields | Ignores them (fields can be added without breaking anything) |

**Frequency.** At most **one packet per astronaut per second**: two packets with the same `measured_at` (at one-second
resolution) overwrite each other and the last one remains. If a slider changes very fast, wait about 600 ms after the last
movement before sending.

**The time.** Send `measured_at` with the **current time**. A packet with a future time waits at the station until that
time (plus the latency) before going up to Earth. If you do not send `measured_at`, the arrival time is used.

**Activity changes what is normal.** A rate of 150 is normal while the astronaut is exercising and an
emergency at rest; during sleep it is normal to be slower. That is why you should always send an `activity_state` that is faithful to
the situation.

## 5. Sleep and consecutive nights

Sleep arrives in `daily_assessment`, normally once a day:

```json
"daily_assessment": {
  "assessment_date": "2026-11-14",
  "sleep_hours_last_night": 5.4,
  "pvt_reaction_time_ms": 410,
  "sensor_hardware": "Actiwatch / PVT-B",
  "signal_quality": "good"
}
```

- The simulator **does not send** the "consecutive nights under 6 h": **the station counts them** from the daily
  assessments. To simulate 3 consecutive nights, send three assessments with consecutive dates (today, yesterday, the day before yesterday), each
  with less than 6 hours.
- A night of 6 hours or more resets the count.
- For these submissions you can send a partial packet with only `schema_version`, `header` and `daily_assessment`.

## 6. Other calls

| Purpose | Call | Body |
|---|---|---|
| Latency, link, mission day | `PUT /api/sim/mission` | `{"link_latency_seconds": 2.6, "mission_day": 78, "time_scale": 1, "link_up": true}` (send only what changes) |
| Cut or restore the link with Earth | `PUT /api/sim/mission` | `{"link_up": false}` / `{"link_up": true}` |
| Set the accumulated radiation dose | `PUT /api/sim/astronauts/{id}/radiation` | `{"mission_dose_msv": 528}` |
| Start a solar event | `POST /api/sim/events/solar` | `{"astronaut_id": "AST-01", "dose_msv": 250}` (without `astronaut_id`: the whole crew) |
| End the solar event | `DELETE /api/sim/events/solar?astronaut_id=AST-01` | |
| View the mission status | `GET /api/sim/mission` | |

- **The mission day does not go in the packet**: it is set with `PUT /api/sim/mission`.
- **The accumulated dose is calculated by the station**: it adds up `rate × time` and, with `time_scale` 1, in a demo it
  is barely noticeable. To see the gauge move, raise `time_scale` or set the dose with the call above.
- A solar event adds only the part of its dose that has not yet been counted (100 and then 250 adds 250, not 350).

## 7. Code examples

All of them send the same packet. Change `ESTACION` if the IP changed.

**curl**

```bash
curl -X POST http://172.20.10.2:8001/api/sim/packet \
  -H "content-type: application/json" -H "X-Actor: Simulador" \
  --data @docs/mocks/simulator/packet-normal.json
```

**Python** (no external libraries)

```python
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

ESTACION = "http://172.20.10.2:8001"


def enviar(paquete, actor="Simulador"):
    peticion = urllib.request.Request(
        f"{ESTACION}/api/sim/packet",
        data=json.dumps(paquete).encode(),
        method="POST",
        headers={"content-type": "application/json", "X-Actor": actor},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=10) as respuesta:
            return json.load(respuesta)  # 201: {"stored": true, "level": ..., "status": ...}
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{error.code}: {error.read().decode()}")  # the 422 includes the reason


paquete = {
    "schema_version": "1.1",
    "header": {"packet_id": "SIM-0001", "astronaut_id": "AST-01",
               "measured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "source": "automated_sensor_stream"},
    "mission_context": {"activity_state": "resting", "comm_latency_sec": 2.6,
                        "environment": {"cabin_co2_mmhg": 2.0}},
    "biometrics": {
        "cardiovascular": {"heart_rate_bpm": 68, "blood_pressure_systolic_mmhg": 118,
                           "blood_pressure_diastolic_mmhg": 76, "sensor_hardware": "Bio-Monitor ECG",
                           "signal_quality": "good"},
        "respiratory": {"spo2_percent": 98, "respiratory_rate_rpm": 14,
                        "sensor_hardware": "Pulse Oximeter", "signal_quality": "good"},
        "thermoregulation": {"core_temp_c": 37.1, "sensor_hardware": "Double Sensor Forehead",
                             "signal_quality": "good"}},
    "daily_assessment": None,
    "radiation_dosimetry": {"daily_rate_msv": 0.42,
                            "solar_particle_event": {"active": False, "event_dose_msv": 0.0},
                            "sensor_hardware": "RAD / Liulin Active Dosimeter", "signal_quality": "good"},
}
print(enviar(paquete))
```

**JavaScript** (browser or Node 18 or later)

```js
const ESTACION = "http://172.20.10.2:8001";

async function enviar(paquete, actor = "Simulador") {
  const respuesta = await fetch(`${ESTACION}/api/sim/packet`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Actor": actor },
    body: JSON.stringify(paquete),
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(`${respuesta.status}: ${JSON.stringify(datos?.detail ?? datos)}`);
  return datos; // 201: { stored: true, level: "...", status: "..." }
}
```

If the simulator runs in a browser on another machine, it works without any configuration: the server accepts requests from
any computer on the local network.

## 8. What to send to simulate situations

| Situation | What to change in the packet | Result |
|---|---|---|
| Tachycardia at rest | `heart_rate_bpm: 149`, `activity_state: "resting"` | Red |
| Exercise (normal) | `heart_rate_bpm: 150`, `activity_state: "exercising"` | Green |
| Fever | `core_temp_c: 38.6` | Orange or red |
| High blood pressure | systolic 150, diastolic 95 | Yellow or higher |
| CO2 rises | `cabin_co2_mmhg: 2.9` | Respiratory system not green |
| Heart sensor with no signal | `signal_quality: "lost"` and the group's values as `null` | The panel shows "NO SIGNAL" |
| Solar storm | `daily_rate_msv: 8`, `solar_particle_event: {active: true, event_dose_msv: 250}` | Red and solar alert |
| Sleep deficit | Three consecutive `daily_assessment` with 5.4 h | Orange |
| Return to normal | A nominal packet with the event set to `active: false` | Back to green |

The exact colors are decided by the backend using ranges that are still under clinical review: they may not match those in
your design.

## 9. Responses and errors

| Code | What it means | What to do |
|---|---|---|
| `201` | Packet received | Nothing. The response carries the resulting `level` and `status` |
| `422` | A value is not valid | Read `detail`: it says which field and why, for example `heart_rate_bpm: Input should be less than or equal to 250` |
| No response | It does not reach the server | Check the IP, the hotspot and the firewall |

Example of a `422`:

```json
{"detail": [{"loc": ["body", "biometrics", "cardiovascular", "heart_rate_bpm"],
             "msg": "Input should be less than or equal to 250", "input": 999}]}
```

## 10. How to check that it arrived

- **At the station**, immediately: `GET http://<IP>:8001/api/crew/AST-01/dashboard` returns everything the console sees
  (values, colors, signal quality).
- **On Earth**, after the latency: `GET http://<IP>:8000/api/astronauts` lists the astronauts with their color. If
  the latency is 2.6 s, it takes a few seconds; with long latencies, much more. This is normal.
- Every change to a variable is recorded in the log: `GET http://<IP>:8001/api/changes?astronaut_id=AST-01` shows who
  moved it (the `X-Actor`), when, and from what value to which.

## 11. If something does not work

| Problem | Probable cause |
|---|---|
| Not even `/api/health` responds | The machine is not on the "iPhone Seber" hotspot, the IP changed, or the firewall blocks port 8001 |
| Responds `201` but the value does not change | Two packets in the same second (they overwrite each other), or the packet carries a future time |
| A value appears blank | `null` or `signal_quality: "lost"` was sent for that sensor |
| Earth does not see the data | The link latency, the link is cut (`link_up: false`), or the packet time is in the future |
| The status is not the expected one | The status is decided by the backend (with the activity and the personal thresholds); the simulator does not calculate it |
| `422` when sending | Value out of range or a disallowed value (`activity_state`, `source`, `signal_quality`, `schema_version`) |

## 12. More information

- `docs/apps-contract.md`, section "App 3": all the fields and their translation to the system variables.
- `docs/mocks/simulator/`: the four example packets.
- `docs/frontend/station/simulator.js`: code to build packets (`buildPacket`) and the scenarios, if the simulator is
  a front-end screen.
- `http://<IP>:8001/docs`: interactive documentation with a "Try it out" button to test each call.
