# Data format (DRAFT)

Agreed between the firmware and backend owners. Change this file BEFORE changing code.

| Field | Type | Unit | Example | Notes |
|---|---|---|---|---|
| astronaut_id | text | - | `A001` | TBD |
| timestamp | text | ISO 8601 (UTC) | `2026-11-14T10:30:00Z` | TBD |
| heart_rate | number | beats per minute | `72` | TBD |
| body_temperature | number | degrees Celsius | `36.6` | TBD |
| blood_pressure_systolic | number | mmHg | `120` | TBD |
| blood_pressure_diastolic | number | mmHg | `80` | TBD |

How often is it sent? TBD
