# Mocks of the API

Real responses of the demo data, saved as JSON, so the three apps can be built **without the backend running**.
`index.json` lists every file with the request that produces it. The contract itself is in
[../apps-contract.md](../apps-contract.md).

| Folder | For | Files |
|---|---|---|
| `earth/` | App 1, Earth monitoring (server `:8000`) | `astronauts`, `astronaut-AST-0x`, `dashboard-AST-0x`, `readings-*`, `alerts*`, `manual-*`, `context-*`, `level-history-*`, `radiation-*`, `thresholds-*`, `exercise-goals-*`, `changes`, `outbox`, `station-link` |
| `station/` | App 2, astronaut console (server `:8001`) | `dashboard-AST-01/02/03`, `manual-*`, `config-*`, `messages-*`, `status`, `mission`, `changes` |
| `simulator/` | App 3, what the simulator sends (`POST /api/sim/packet`) | `packet-normal`, `packet-sensor-lost`, `packet-daily-assessment`, `packet-solar-event` |
| (root) | all | `variables.json`: every variable, its unit, range and who edits it |

The three demo astronauts show every state on purpose:

| Astronaut | Colour in the mocks | Good for testing |
|---|---|---|
| `AST-01` | yellow | The calm screen: only the exercise adherence and a headache report keep it yellow |
| `AST-02` | orange | Personal thresholds, radiation budget after a solar event |
| `AST-03` | red | A lost sensor, the item 9 alert, the brain system in red, every colour in the history |

## Using them in the frontend

Keep one switch, so changing from mocks to the real API is changing one variable:

```js
// api.js
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function getJSON(path, mockFile) {
  const url = USE_MOCKS ? `/mocks/${mockFile}` : `${API}${path}`;   // mocks are served from public/mocks
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

// getJSON("/api/astronauts", "earth/astronauts.json")
// getJSON(`/api/crew/${id}/dashboard`, `station/dashboard-${id}.json`)
```

Copy the folder next to the frontend (`frontend/public/mocks`) and start with `VITE_USE_MOCKS=true`.
Polling works the same with mocks: the file is read again every time, it just never changes.

To see how the screen **reacts to a change**, edit a mock by hand (for example set `"level": "red"` in
`station/dashboard-AST-01.json`) and wait for the next refresh.

## Notes

- They are a snapshot: times are those of the demo history and `A001` to `A003` (the older built-in demo) are in
  `earth/astronauts.json` with the readings of the moment they were saved.
- Regenerate them against the running backend with `python scripts/export_mocks.py` (add the host to use another
  computer: `python scripts/export_mocks.py 172.20.10.2`) and commit the new files.
- Values, colours and texts come from the placeholder ranges of the backend, which are still under clinical review.
