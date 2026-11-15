# Earth interface

The screen at `/earth`. It is designed for a 1440 x 810 display and scales to any other size (see
[Responsive scaling](#responsive-scaling)). Nothing scrolls at page level.

## Layout

Three columns:

| Column | Content |
|---|---|
| Left | **Astronauts**: one card per astronaut, worst first. Below it **Recent alerts**. |
| Middle | The **body diagram** with the name, id and status of the selected astronaut, and the **system tabs** under it. |
| Right | The **overview** (default) or the panel of the chosen system. |

Bottom right corner, always visible: the **Send alert** button and the **Settings** button.

Before an astronaut is chosen, the right area shows a hint asking the user to select one.

### Astronaut list

- Each card shows name, gender, a status badge (Normal, Watch, Attention, Emergency or No data), and the last heart
  rate, temperature and activity.
- The colour is `overall_level` from `GET /api/astronauts`: sensors, manual measurements, symptoms and radiation
  together. If that colour only comes from a sensor that lost its signal it is recomputed (see below).
- The list takes the space it needs. A scroll bar appears only if the astronauts do not fit, and it never shrinks the
  alert box under it.

### Recent alerts

- Shows the newest alerts of the selected astronaut (of everyone while none is selected), each with date, time,
  astronaut name and summary.
- The number of alerts and the lines of text each one gets are computed from the height of the box, so the box is
  always full and an alert is never cut in half.
- **View history** opens a pop-up with every alert of the selected astronaut (up to 500, newest first). The button is
  disabled while no astronaut is selected.
- Alerts that only say a sensor lost its signal are hidden.

## Body diagram

A flat, glowing 2D diagram (male or female, according to the profile). Heart rate, temperature and blood pressure
appear next to their organs.

### Systems and organs

| System | Tab | Organs painted |
|---|---|---|
| `heart` | Cardiovascular | heart, blood vessels |
| `lungs` | Respiratory | lungs, airway |
| `brain` | Neurological | brain |
| `metabolism` | Metabolic | liver, stomach |
| `thermal` | Thermoregulation | whole skin (overview), thermal-camera view (focus) |
| `radiation` | Radiation | whole skin |
| `bones` | Bone and muscle | symbolic skeleton, shown only in focus |
| `eyes` | Eyes (SANS) | eyes |

The mapping lives in `src/lib/bodyFlags.js` (`SYSTEM_REGIONS` and `FOCUS_REGIONS`).

### Views

- **Overview** (tab "Overview"): every organ is painted with the level of its system. Yellow, orange and red organs
  pulse; green organs keep the base blue.
- **Focus** (any other tab): only the organs of that system are highlighted and everything else returns to the base
  blue. Clicking an organ opens its tab; clicking it again, or the diagram background, returns to the overview.
- **Skeleton** (Bone and muscle): the organs fade and a skeleton drawn to the proportions of the silhouette appears,
  coloured with the system level.
- **Thermal view** (Thermoregulation): a heat-camera look. A normal temperature uses a calm violet background with a
  warm body; the palette gets hotter as the level goes yellow, orange and red.
- A blue **scanner line** sweeps the body from head to feet all the time.

## Right column

### Overview

- **Seven cards** in this order: Sleep, Mood / Stress, Heart rate, Blood pressure, Temperature, Radiation, Glucose.
  Mood shows the PHQ-9 score out of 27 and the GAD-7 score out of 21. Each card shows a state word instead of a colour
  name:

  | Level | Word |
  |---|---|
  | green | Stable |
  | yellow | Under observation |
  | orange | Attention |
  | red | Critical |
  | none | No data |

- **Accumulated radiation dose**: a bar with the percentage of the career limit and the dose in mSv.
- **Wellbeing questionnaires**: see below.

### System panel

Name, description, associated NASA hazard, measuring hardware, findings with their values, **Recommended action**, and
space physiology.

*Recommended action* has two sources: a fixed sentence for the level (from the dictionaries) and, when an indicator of
that system is altered, the steps sent by the backend (`dashboard.guides[].steps`, in English).

Below it, **General recommendations** is a drop-down with five tips per system. It opens by itself when the panel has
empty room and closes when it does not; a click on its title overrides this until another tab is chosen. These texts
are drafts that must be validated by the medical team.

## Wellbeing questionnaires

Two cards, **Depression (PHQ-9)** and **Anxiety (GAD-7)**, each with the last result, a 24 hour reminder and an
*Answer* button. *See past answers* sits in the title row and opens the history.

- One question per screen, then the result with score, severity band, proposed treatment and the list of answers.
- Bands: PHQ-9 0-4 green, 5-9 yellow, 10-14 orange, 15-19 red, 20-27 red. GAD-7 0-4 green, 5-9 yellow, 10-14 orange,
  15-21 red. A GAD-7 score of 8 or more adds a note about a probable generalized anxiety disorder.
- **Item 9 of the PHQ-9** above zero always gives a red result, whatever the total, and shows a safety message.
- The result is sent to the station (see [api-usage.md](api-usage.md)).

## Send alert (symptom report)

The button in the bottom right corner opens a form to report a symptom to the ground. It needs an astronaut to be
selected.

- **Symptom** (required): pain, headache, nausea, dizziness, fatigue, fever, difficulty breathing, chest pain,
  vision problems, mood, injury, other.
- **Severity** (required): mild, moderate, severe.
- **Body area** (optional), **description** (optional, up to 4000 characters), **reported by** (pre-filled with the
  astronaut name).

### Coherence between symptom and body area

Options that do not make sense together are disabled in both directions, and an area that stops fitting is cleared.
When a symptom has a single possible area, it is selected automatically.

| Symptom | Allowed areas |
|---|---|
| Headache | head |
| Chest pain | chest |
| Fatigue, fever | general |
| Difficulty breathing | chest, general |
| Dizziness, mood | head, general |
| Nausea | abdomen, head, general |
| Vision problems | eyes, head |
| Pain, injury, other | any |

The table is the `AREAS_OF` constant in `src/earth/SymptomReportDialog.jsx`. It is a product decision, not a server
rule.

## How missing data is handled

1. **Last known value.** When a response has a hole (a null value, a sensor without signal, a missing block), the value
   already on screen stays, with its own colour. This covers vitals, manual measurements, radiation, level, and the
   astronaut list. Each astronaut keeps their own last data, so switching astronauts never shows another person's
   values. Implemented in `src/earth/lastKnown.js`.
2. **Never received.** A value that has never arrived is left empty and carries no colour.
3. **Sensor signal loss is not shown as an emergency.** The backend raises findings named `signal_*` (often red) when a
   sensor group loses its signal. The frontend drops them, recalculates the level of each affected system from the
   remaining findings, and recalculates the overall level. The sensor-lost chips and the "signal lost" alerts are
   hidden too. This applies to every sensor group, not only temperature. The rule is `neutralizeSignalLoss` in
   `src/earth/lastKnown.js`; remove its use in `keepLastDashboard` to go back to the backend's behaviour.
4. **No connection.** A closable warning toast appears when a server does not answer. It stays closed while polling
   keeps failing, comes back when the user tries something that needs the backend (sending an alert, answering a
   questionnaire), and disappears by itself when the server answers again.

## Settings

The gear button opens the settings panel. Today it has one setting, **Language** (Spanish or English), which changes the
whole platform immediately and is remembered in the browser (`localStorage`, key `ahm.lang`). See [i18n.md](i18n.md).

## Responsive scaling

`src/App.jsx` measures the window and multiplies everything (text, icons, diagram, spacing, dialogs) by one factor,
`min(width / 1440, height / 810)`, limited to 0.4 - 3, using the CSS `zoom` property. The layout is then drawn in a
virtual screen of `width / factor` by `height / factor` pixels, so a screen that is wider or taller than 16:9 simply
gets more room. Browsers need to support `zoom` (Chrome, Edge, Safari, and Firefox 126 or newer).

## Other details

- The mouse cursor is a small spaceship. The engine is off on normal ground and turns on, with a flickering flame, over
  anything clickable (`src/shared/cursor.js`). The flame frames only change while the pointer is over something
  clickable, and not at all with reduced motion enabled.
- Animations respect `prefers-reduced-motion`.
