# Data format (DRAFT)

Agreed between the firmware and backend owners. Change this file BEFORE changing code.

Implemented in `backend/shared/vitals.py` (class `Reading`). A request outside the
allowed range is rejected with HTTP 422.

| Field | Type | Unit | Example | Allowed range |
|---|---|---|---|---|
| astronaut_id | text | - | `A001` | 1 to 32 characters |
| timestamp | text | ISO 8601 (UTC) | `2026-11-14T10:30:00Z` | Without a time zone it is read as UTC |
| heart_rate | number | beats per minute | `72` | 20 to 250 |
| body_temperature | number | degrees Celsius | `36.6` | 30 to 43 |
| blood_pressure_systolic | number | mmHg | `120` | 50 to 260 |
| blood_pressure_diastolic | number | mmHg | `80` | 30 to 160 |

Two readings with the same `astronaut_id` and `timestamp` count as the same
reading: sending it twice is harmless.

## More variables

Only `astronaut_id` and `timestamp` are required: every other field is optional, because the simulator
may send just the variables it changed and blood pressure is normally typed by the crew. Besides the six
fields above a reading can carry: `hrv_ms`, `sleep_hours`, `consecutive_nights_under_6h`, `pvt_b_ms`,
`spo2`, `respiratory_rate`, `radiation_rate_msv_day`, `radiation_dose_msv`, `spe_active`,
`spe_event_dose_msv`, `cabin_co2_mmhg`, `crew_state`, `mission_day`, `packet_id` and `meta`.
Units and ranges of all of them: `GET /api/variables`. The simulator app sends its own nested packet
format, described in [apps-contract.md](apps-contract.md).

## Astronaut profile

Data that does not change over time is stored once per astronaut, not in every
reading. It is set with `PUT /api/astronauts/{id}` on the Earth base (fields you
leave out are not changed) and comes back in `GET /api/astronauts`.

| Field | Type | Values |
|---|---|---|
| gender | text or `null` | `female`, `male`, `other` (`null` = not set) |
| name | text or `null` | Up to 80 characters |

## Where each message goes

| From | To | Endpoint | Body |
|---|---|---|---|
| ESP32 | space-station | `POST http://<COMPUTER_IP>:8001/api/readings` | One reading (the table above) |
| space-station | earth-base | `POST /api/telemetry` | `{"readings": [ ... ]}` (1 to 1000 readings) |
| earth-base | space-station | `POST /api/messages` | `{"astronaut_id", "severity", "body"}` |

How often is it sent? The simulator measures every 2 seconds (`SIM_INTERVAL_SECONDS`).
For the ESP32 the rate is still TBD.
