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
- [ ] Every user text is in Spanish (dictionary) and an unknown key does not break the screen.

## Prompt for the Claude of the Earth team

Copy everything between the lines into the assistant.

----------------------------------------------------------------------
Eres mi asistente de desarrollo frontend en un hackathon (NASA Space Apps 2026, reto "software de monitoreo de salud
para astronautas"). Voy a construir la **app de monitoreo en Tierra** (App 1: control de misión / oficial médico). Habla
SOLO con el servidor de la **base en Tierra**. El backend (FastAPI) ya está hecho y funcionando: yo solo hago el
frontend (React 19 + Vite + Recharts, carpeta `frontend/`).

LEE ANTES DE ESCRIBIR CÓDIGO, en este orden:
1. `docs/frontend/README.md`  (reglas y puesta en marcha)
2. `docs/frontend/earth/README.md`  (esta guía: pantallas, extracción de datos, edición)
3. `docs/apps-contract.md`  (sección "App 1", "Change log" y "Who decides the colour")
4. `docs/mocks/README.md` y los JSON de `docs/mocks/earth/` (respuestas reales)
5. El código de `docs/frontend/shared/` y `docs/frontend/earth/`: es un kit de ejemplo ya probado contra la API real.
   Úsalo como base (cópialo a `frontend/src/`); no lo reescribas desde cero.

QUÉ CONSTRUIR
- Inicio: lista de todos los astronautas, el peor primero, con el color `overall_level`, nombre, género y último dato.
- Detalle de un astronauta: los 8 sistemas con su color, signos vitales contra la línea base, radiación, calidad de señal.
- Alertas: feed con aviso de alertas NUEVAS.
- Tendencias (Recharts): frecuencia cardíaca, temperatura, sueño, PVT-B, radiación, con el semáforo de fondo y los
  periodos sin señal marcados.
- Capturas manuales de la tripulación (presión, glucosa, PHQ-9/GAD-7 con la alerta del Ítem 9, bitácora).
- Contexto de una alerta: CO2 de cabina, historial de semáforo, bitácora de protocolos. Registro de cambios.
- Edición: expediente y línea base, umbrales personalizados (por defecto vs personal), metas de ejercicio, notas
  médicas y mensajes al astronauta. Todo viaja a la estación con retraso: muestra "pendiente de entrega".
- El diseño visual es libre; el contrato de datos no.

REGLAS QUE NO SE NEGOCIAN
1. **El backend decide el estado y el color** (`overall_level`, `level`, `systems[].level`). El front solo pinta.
   NUNCA compares números con umbrales en el front: dependen de la actividad y de umbrales personales por astronauta.
2. **Tierra NO es "en vivo"**: ve los datos después de la latencia del enlace (2.6 s en la Luna, hasta 44 min en
   Marte). Juzga lo viejo por la hora del dato (`measured_at`) y no por el reloj; que no se vea como un error.
3. **`null` no es cero**: un sensor sin señal llega `null`. En los gráficos usa `connectNulls={false}` (la línea
   tiene un hueco; no rellenes con el último valor).
4. **Consulta cada 3 s** (lista, alertas, detalle); gráficos cada 10 s o al cambiar el rango. La siguiente consulta
   empieza cuando termina la anterior; pausa con la pestaña oculta; si falla, conserva el último dato y avisa.
5. **Alertas nuevas** = `id` mayor que el más alto visto; la primera respuesta es el punto de partida (`useNewAlerts`).
6. **Cada escritura envía `X-Actor`** con el nombre de la persona (queda en el registro de cambios), y los `422` se
   muestran con el motivo del backend (`describeError`). Una escritura rechazada o en espera no es un fallo.
7. **Textos de usuario en español (es-CL)** con `docs/frontend/shared/i18n-es.json` por clave; una clave que no esté
   no debe romper la pantalla. Las frases de `findings[].advice` vienen en inglés por ahora.
8. Habla solo con Tierra (`VITE_EARTH_URL`). La IP cambia si se reinicia el hotspot: va en `.env`, nunca en el código.
   Pídeme la IP actual.

CÓMO EXTRAER LOS DATOS (diséñalo así)
- Inicio: `GET /api/astronauts` (incluye `overall_level`, el mismo color que la consola del astronauta).
- Detalle: `GET /api/astronauts/{id}/dashboard` (misma forma que la consola: sirven `DashboardView` y `buildCards`).
- Historial largo: `GET /api/astronauts/{id}/readings?since=...&bucket_seconds=300&limit=5000`.
- Estado de entrega de lo que se envió a la estación: `GET /api/outbox?pending_only=true`.
- Registro de cambios: `GET /api/changes` (filtros `astronaut_id`, `variable`, `origin`, `since`).

CÓMO TRABAJAR
- Empieza con `VITE_USE_MOCKS=true` (copia `docs/mocks` a `frontend/public/mocks`); luego cambia a la API real.
- Datos de prueba: AST-01 (amarillo), AST-02 (naranja, umbrales personales y evento solar), AST-03 (rojo, sensor sin
  señal, alerta Ítem 9).
- Antes de dar algo por terminado, pruébalo contra la API real y comprueba la lista "Done when" de
  `docs/frontend/earth/README.md`.
- Si algo del contrato no está claro o falta un dato, NO lo inventes: dime qué falta y yo lo pido al backend.
----------------------------------------------------------------------
