# Frontend architecture

## Data flow

```
Earth server  --GET every 3 s-->  usePolling  -->  useLastKnown  -->  EarthPage  -->  DashboardView / lists
Station server  <--POST--  QuestionnaireDialog, SymptomReportDialog
```

1. **`src/shared/request.js`** is the only place that calls `fetch`. It builds the URL from `EARTH_URL` or `STATION_URL`,
   sends the `X-Actor` header, throws an `ApiError` (`status 0` means no answer), and reports success or failure to the
   connection store. With `VITE_USE_MOCKS=true` it reads `public/mocks/` instead.
2. **`src/earth/earthApi.js`** wraps the Earth endpoints; **`src/earth/surveyApi.js`** wraps the station endpoints used
   by the questionnaires and the symptom report.
3. **`src/shared/hooks.js`** exports `usePolling(fetcher, { seconds, enabled, deps })`:
   - the next request starts only when the previous one finished;
   - it pauses while the browser tab is hidden;
   - on an error it keeps the last good `data` and sets `error`;
   - it caches the last answer of each `deps` key (for example each astronaut), and never returns the data of another
     key.
4. **`src/earth/lastKnown.js`** fills the holes of a new answer with the previous one (`keepLastDashboard`,
   `keepLastAstronauts`, `useLastKnown`) and removes sensor signal-loss findings (`neutralizeSignalLoss`).
5. **`src/earth/EarthPage.jsx`** wires everything:

   | Data | Interval |
   |---|---|
   | Astronaut list | 3 s |
   | Dashboard of the selected astronaut | 3 s |
   | Alerts | 3 s |
   | Dashboards of every astronaut (only to recompute list colours after signal loss) | 10 s |
   | Questionnaire results | 30 s |

6. **`src/connection.js`** is a tiny external store (`useSyncExternalStore`) with `{ down, hidden }`.
   `needsBackend(action)` wraps an action so that, with no connection, it shows the warning instead of running.

## Components

| Component | Role |
|---|---|
| `earth/EarthPage.jsx` | Page and layout; owns the selected astronaut and system |
| `earth/AstronautList.jsx` | Selector cards |
| `earth/AlertFeed.jsx` | Measures its box and decides how many alerts and lines fit |
| `earth/AlertHistoryModal.jsx` | Full alert history of one astronaut |
| `shared/DashboardView.jsx` | Body column, system tabs, overview and system panel; paints only what the backend sent |
| `components/BodyDiagram.jsx` | SVG diagram; `components/Skeleton.jsx` draws the skeleton |
| `earth/WellbeingSection.jsx` | Questionnaire cards and dialogs (`components/WellbeingPanel`, `QuestionnaireDialog`, `HistoryDialog`, `ResultView`) |
| `earth/SendAlertButton.jsx`, `SymptomReportDialog.jsx` | Symptom report |
| `earth/SettingsMenu.jsx` | Settings panel |
| `earth/ConnectionToast.jsx` | Backend warning |
| `components/Modal.jsx` | A native `<dialog>`; Escape closes it and focus stays inside |

`DashboardView` receives `overviewExtra`, a node drawn at the end of the overview, which is how the wellbeing section is
placed there.

## Body diagram

- `lib/bodyOutline.js` holds the silhouettes (right half of each body as points, drawn with a smooth curve), hands, feet
  and the "eight heads" proportions.
- `lib/bodyFlags.js` maps systems to regions and builds the flags (`regionFlags`). `FOCUS_REGIONS` is the same mapping
  except for the thermal system.
- `BodyDiagram` takes `flags` (region to level), `selected` (one region or a list), `vitals`, `gender`, `onSelect`, and
  the translator `t`. It is wrapped in `memo`, so it redraws only when those props change and not on every poll.
- The skeleton is drawn only when the region `skeleton` is selected. The thermal view is drawn only when the region
  `thermal` is selected; the palette is chosen by the `heat-ok`, `heat-yellow`, `heat-orange` or `heat-red` class.

## Styles

| File | Content |
|---|---|
| `src/theme.css` | Theme variables, cards, system panel, dashboard pieces |
| `src/earth/earth.css` | Page layout, diagram, toast, alert feed, panels, corner buttons, cursor rules |
| `src/earth/wellbeing.css` | Dialogs, questionnaires, symptom form, score rings |
| `src/styles.css` | Base styles of the original project |

Rules to know:

- Colours of a level come from `data-level` attributes or `level-*` classes, always set from backend data.
- The layout uses a grid of three columns with `grid-template-rows: minmax(0, 1fr)` and `min-height: 0` on flex
  children, so each column manages its own overflow.
- Fonts are Chakra Petch and IBM Plex Mono (`@fontsource`).

## Responsive scaling

`App.jsx` (`useUiScale`) sets `zoom`, `width` and `height` on the root element and exposes `--ui-w` and `--ui-h` (the
virtual size). Dialogs use these variables instead of `vw` / `vh`. See
[earth-interface.md](earth-interface.md#responsive-scaling).

## How to extend

**A new body system or region.** Add the system to `SYSTEM_REGIONS` in `lib/bodyFlags.js`, draw the region in
`BodyDiagram.jsx` with the `organ("id")` helper, and add its texts under `systems` and `bodyLabels` in both dictionaries.

**A new setting.** Add a row inside `SettingsMenu.jsx`. If it must be remembered, follow `shared/lang.js`: a small store
with `useSyncExternalStore` and a guarded `localStorage`.

**A new card.** Add it to `buildCards` in `shared/monitor.js`, to `cardValue` in `DashboardView.jsx`, and its name under
`cards` in both dictionaries.

**A new questionnaire.** Add its definition to `lib/questionnaires.js` and its Spanish texts to
`lib/questionnaires-es.js`. Scoring and levels are language independent.

## Unused code that is kept

`earth/ThresholdsEditor.jsx`, `earth/TrendChart.jsx`, `earth/chartData.js`, `pages/Home.jsx`,
`pages/AstronautDetail.jsx` and `components/BodyPointCloud.jsx` are not used by the current interface. The threshold
editor can be mounted again with `earth.thresholds(id)` and `earth.putThresholds(id, patch, actor)`.
