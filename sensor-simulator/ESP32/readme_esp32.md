# ESP32 + K-Type Thermocouple Temperature Monitor: Project Documentation

*Nov 15, 2026 — @Valeria*

## Overview

An ESP32 reads a K-type thermocouple through a MAX6675 module and serves the temperature over Wi-Fi as JSON; a browser-based Sensor Simulator polls it once per second and uses it as the **"Core Body Temperature"** value.

The ESP32 only measures and serves. The simulator still builds and sends the rest of the `telemetry-v1.1` packet unchanged.

```text
K-type thermocouple -> MAX6675 -> ESP32 -> Wi-Fi -> GET /temperatura (JSON) -> Sensor Simulator (browser)
```

| Component | Location | Role |
| :--- | :--- | :--- |
| **Firmware** | `firmware/esp32_temperature/esp32_temperature.ino` | Reads the sensor every second, runs the web server |
| **Wi-Fi credentials template** | `firmware/esp32_temperature/secrets.h.example` | Copied to `secrets.h` with your own SSID and password |
| **Simulator add-on** | `sensor-simulator/emitter/js/esp32-temperature.js` | Adds an "ESP32 live" panel and polls the ESP32 |

---

## Hardware and Wiring

The project needs an ESP32 development board, a K-type thermocouple, and a MAX6675 amplifier module. The data pins are defined in the firmware; power pins follow the usual MAX6675 module convention.

| MAX6675 Pin | ESP32 Pin | Defined in Firmware as |
| :--- | :--- | :--- |
| **SCK/CLK** | GPIO 18 | `thermoCLK` |
| **CS** | GPIO 5 | `thermoCS` |
| **SO/DO** | GPIO 19 | `thermoDO` |
| **VCC** | 3.3 V (typical) | *not in code* |
| **GND** | GND | *not in code* |

> **Note:** Connect the thermocouple wires to the module's `T+` and `T-` screw terminals and keep the polarity correct; reversed wires read lower as the temperature rises. If the thermocouple is disconnected, the MAX6675 returns an invalid reading and the firmware reports an error.

---

## Firmware and Simulator Behavior

The firmware connects to Wi-Fi, starts a web server on port 80, and refreshes the temperature once per second (the MAX6675 needs at least 220 ms between reads).

### ESP32 Endpoints

| Route | Returns | Purpose |
| :--- | :--- | :--- |
| `GET /` | HTML page | Local debug monitor that refreshes every second (UI text is in Spanish) |
| `GET /temperatura` | JSON | Data feed for the simulator |

The `/temperatura` response (key names are in Spanish, kept as in the code):

```json
{"valida": true, "temperatura": 36.50}
```

If the thermocouple read fails (`NaN`), it answers:

```json
{"valida": false}
```

The route sends `Access-Control-Allow-Origin: *` so the simulator, served from another address or port, can read it, and `Cache-Control: no-store` to avoid stale values.

### Wi-Fi Handling
On boot, it waits up to 20 s for a connection and prints the IP on the serial monitor. If the connection drops, `loop()` retries every 10 s without blocking. The web server starts once, when Wi-Fi first becomes available.

### Simulator Add-on (`esp32-temperature.js`)
It inserts an **"ESP32 live thermocouple"** panel at the top of the Thermoregulation tab, with a **"Use ESP32"** checkbox and an IP field (remembered in `localStorage`). While enabled, it polls the ESP32 every 1000 ms with a 2000 ms timeout and writes the value into the existing `#temp-num` field, so the packet builder, JSON preview, and anatomy map keep working unchanged. The manual field and slider are disabled while it runs and restored, with the previous signal quality, when it stops.

### Telemetry-v1.1 Rule
`core_temp_c` must be between $30.0$ and $44.0^\circ\text{C}$. The signal is set to `"lost"` (`core_temp_c` sent as `null`) when:
* The ESP32 does not answer within 2 s,
* The thermocouple reports an error (`valida: false`),
* Or the reading falls outside $30.0 - 44.0^\circ\text{C}$.

Otherwise, the value is shown with one decimal and the signal is `"good"`.

---

## Setup and Usage

1. Wire the MAX6675 to the ESP32 as shown above.
2. In the Arduino IDE, install the ESP32 board package and a MAX6675 library that provides `max6675.h` (`WiFi.h` and `WebServer.h` come with the ESP32 package).
3. In `firmware/esp32_temperature/`, copy `secrets.h.example` to `secrets.h` and set your network:
   ```cpp
   #define WIFI_SSID     "YOUR_WIFI_NAME"
   #define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
   ```
4. Upload `esp32_temperature.ino` and open the serial monitor at **115200 baud**.
5. Wait for `"Wi-Fi connected"` and note the printed IP address.
6. Open `http://<ESP32_IP>/` in a browser on the same network to check the local page, or `http://<ESP32_IP>/temperatura` to check the JSON.
7. In the simulator's `index.html`, load `js/esp32-temperature.js` **after** `js/app.js`.
8. In the **Thermoregulation** tab, enter the ESP32 IP, tick **"Use ESP32"**, and confirm the status line shows `"Live"`.

> **Security & Network Notes:**
> * `secrets.h` is listed in `.gitignore` and must never be committed. Commit only `secrets.h.example`.
> * The computer running the simulator and the ESP32 must be on the same Wi-Fi network. If the simulator page is served over HTTPS, browsers may block requests to the ESP32's plain `http://` address (mixed content); serve the simulator over HTTP or from `localhost`.

---

## Troubleshooting and Limitations

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| Serial monitor shows dots and `"Could not connect"` | Wrong SSID or password in `secrets.h`, or the network is out of range | Correct `secrets.h` and re-upload; the board keeps retrying every 10 s |
| Simulator says `"No response from the ESP32"` | Wrong IP, different network, or HTTPS page blocking HTTP | Re-check the IP in the serial monitor; use the same Wi-Fi; serve the simulator over HTTP |
| `"Thermocouple reports an error"` / `"thermocouple error"` in serial | Thermocouple disconnected, loose terminal, or wrong data pins | Check `T+`/`T-` terminals and the three data wires (GPIO 18, 5, 19) |
| `"Reading ... is outside 30.0-44.0 C"` | Probe is not at body-temperature range | Expected: the simulator sends the signal as lost outside `telemetry-v1.1` limits |
| Compile error on `max6675.h` or `secrets.h` | Library missing, or `secrets.h` not created | Install the MAX6675 library; copy `secrets.h.example` to `secrets.h` |

### Limitations
The endpoint has no authentication and allows any origin, so use it only on a trusted local network. The reading is taken once per second and shown with 2 decimals by the ESP32 and 1 decimal by the simulator. No calibration offset is applied in the code.

---

## Project Structure and Design Decisions

The delivered package (`esp32_temperatura_simulador.zip`) contains four files:

```text
├── firmware/
│   └── esp32_temperature/
│       ├── esp32_temperature.ino   # ESP32 firmware (sensor + web server)
│       ├── secrets.h.example       # Wi-Fi credentials template
│       └── .gitignore              # Keeps secrets.h out of version control
└── sensor-simulator/
    └── emitter/
        └── js/
            └── esp32-temperature.js    # Simulator add-on (ESP32 live panel)
```

### Design Decisions Recorded in the Code
* **Measure and serve only:** The ESP32 does not build telemetry packets; the simulator remains the single place that creates the `telemetry-v1.1` packet.
* **Pull model over HTTP:** The simulator polls `GET /temperatura` once per second instead of the ESP32 pushing data, so the ESP32 needs no knowledge of the simulator's address.
* **Non-invasive integration:** The add-on writes into the existing `#temp-num` field and fires the same `input` and `change` events the page already listens to, so no change to `app.js` is needed.
* **Fail safe:** Any failure (no answer, sensor error, out-of-range value) sets the signal to `"lost"` and `core_temp_c` is sent as `null`, never a made-up value.
* **Secrets outside the code:** Wi-Fi name and password live in `secrets.h`, which is git-ignored; only the example template is shared.
* **Non-blocking Wi-Fi:** Reconnection is attempted every 10 s from `loop()` so the board never freezes waiting for the network.

---

## Code Walkthrough

### Firmware (`esp32_temperature.ino`)

| Element | What it does |
| :--- | :--- |
| `thermoDO = 19`, `thermoCS = 5`, `thermoCLK = 18` | GPIO pins used for the MAX6675 SPI-style link |
| `MAX6675 thermocouple(CLK, CS, DO)` | Sensor object from the MAX6675 library |
| `WebServer server(80)` | HTTP server on port 80 |
| `temperature` (`float`, starts as `NAN`) | Last reading; `NAN` means no valid reading yet or sensor error |
| `lastReading`, `serverStarted` | Timer for the 1 s read cycle; flag so the server starts only once |
| `page[]` (`PROGMEM`) | Embedded HTML debug page; calls `/temperatura` every second and shows the value or an error message |
| `handleRoot()` | Serves the debug page at `/` |
| `handleTemperature()` | Sends CORS and no-cache headers, then returns `{"valida":true,"temperatura":<value, 2 decimals>}` or `{"valida":false}` |
| `connectWiFi()` | Station mode; waits up to 20 s; prints the IP to serial |
| `setup()` | Opens serial at 115200 baud, prints a banner, connects to Wi-Fi |
| `loop()` | Retries Wi-Fi if lost (every 10 s), starts the server once, calls `handleClient()`, reads the thermocouple every 1000 ms and logs it to serial |

### Simulator Add-on (`esp32-temperature.js`)

| Element | What it does |
| :--- | :--- |
| `POLL_MS = 1000`, `TIMEOUT_MS = 2000` | Polling interval and request timeout |
| `MIN_C = 30.0`, `MAX_C = 44.0` | Valid range from `telemetry-v1.1` |
| `STORAGE_KEY` | `localStorage` key that remembers the ESP32 IP |
| **Panel creation** | Inserts the "ESP32 live thermocouple" box (checkbox, IP field, status line) at the top of the Thermoregulation tab |
| `setStatus(text, ok)` | Updates the status line: green for ok, red for error, grey for neutral |
| `setQuality(value)` | Changes the signal-quality select and fires `change` so the page updates |
| `setTemperature(celsius)` | Writes the value (1 decimal) to the number field and slider and fires `input` |
| `baseUrl()` | Cleans the typed IP and adds `http://` if missing |
| `readOnce()` | One request with timeout; applies the validity and range rules and sets value, quality, and status |
| `loop()` | Runs `readOnce()` then schedules itself again after 1 s while enabled |
| `start()` / `stop()` | **Enable:** saves the IP, locks manual inputs, starts polling. **Disable:** stops polling, unlocks inputs, restores the previous quality |

---

## Appendices

### Appendix A: Firmware Source (`esp32_temperature.ino`)

```cpp
// ESP32 + K-type thermocouple (MAX6675) -> core temperature for the Sensor Simulator
//
// The ESP32 only MEASURES and SERVES the temperature:
//   GET http://<ESP32_IP>/temperatura  ->  {"valida": true, "temperatura": 36.50}
//
// The Sensor Simulator page (sensor-simulator/emitter, file js/esp32-temperature.js)
// reads that value and puts it in the "Core Body Temperature" field. The rest of the
// telemetry-v1.1 packet is still built and sent by the simulator, untouched.
//
// Wi-Fi name and password live in secrets.h (copy secrets.h.example). It is NOT committed.

#include <WiFi.h>
#include <WebServer.h>
#include "max6675.h"
#include "secrets.h"

// =====================================================================
// MAX6675 PINS
// =====================================================================
int thermoDO  = 19;
int thermoCS  = 5;
int thermoCLK = 18;

MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);

// =====================================================================
// STATE
// =====================================================================
WebServer server(80);
float temperature = NAN;
unsigned long lastReading = 0;
bool serverStarted = false;

// =====================================================================
// LOCAL DEBUG PAGE (original design)
// =====================================================================
const char page[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitor de Temperatura</title>
  <style>
    body { font-family: Arial, sans-serif; background: #101827; color: white; text-align: center; margin: 0; padding: 25px; }
    .contenedor { max-width: 450px; margin: 50px auto; background: #1e293b; padding: 30px; border-radius: 20px; }
    h1 { font-size: 25px; color: #38bdf8; }
    .temperatura { font-size: 65px; font-weight: bold; margin: 30px 0; color: #38bdf8; }
    .unidad { font-size: 25px; }
    .estado { font-size: 16px; color: #22c55e; }
    .info { color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="contenedor">
    <h1>MONITOR DE TEMPERATURA</h1>
    <p class="info">ESP32 + TERMOPAR TIPO K</p>
    <div class="temperatura">
      <span id="temp">--.--</span>
      <span class="unidad">°C</span>
    </div>
    <p class="estado" id="estado">Conectando...</p>
    <p class="info">Actualizacion automatica cada segundo</p>
  </div>
  <script>
    async function actualizarTemperatura() {
      try {
        const respuesta = await fetch('/temperatura');
        const datos = await respuesta.json();
        if (datos.valida) {
          document.getElementById("temp").textContent = datos.temperatura.toFixed(2);
          document.getElementById("estado").textContent = "Sensor funcionando correctamente";
          document.getElementById("estado").style.color = "#22c55e";
        } else {
          document.getElementById("temp").textContent = "--.--";
          document.getElementById("estado").textContent = "Error: revisar termopar";
          document.getElementById("estado").style.color = "#ef4444";
        }
      } catch (error) {
        document.getElementById("estado").textContent = "Error de comunicacion";
        document.getElementById("estado").style.color = "#ef4444";
      }
    }
    setInterval(actualizarTemperatura, 1000);
    actualizarTemperatura();
  </script>
</body>
</html>
)rawliteral";

// =====================================================================
// ROUTES
// =====================================================================
void handleRoot() {
  server.send_P(200, "text/html", page);
}

void handleTemperature() {
  // CORS: the Sensor Simulator page runs on another address/port, so the
  // browser needs this header to be allowed to read the answer.
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");

  if (isnan(temperature)) {
    server.send(200, "application/json", "{\"valida\":false}");
  } else {
    String body = "{\"valida\":true,\"temperatura\":";
    body += String(temperature, 2);
    body += "}";
    server.send(200, "application/json", body);
  }
}

// =====================================================================
// WI-FI
// =====================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    Serial.print("ESP32 IP (type it in the simulator): ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Could not connect. Will retry in loop(). Check name and password.");
  }
}

// =====================================================================
// SETUP / LOOP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("K-type thermocouple + ESP32 (Sensor Simulator temperature)");
  connectWiFi();
}

void loop() {
  // Reconnect without blocking forever
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt > 10000) {
      lastAttempt = millis();
      Serial.println("Wi-Fi lost, retrying...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }

  // Start the web server once, when Wi-Fi is available
  if (!serverStarted) {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/temperatura", HTTP_GET, handleTemperature);
    server.begin();
    serverStarted = true;
    Serial.println("Web server started. Open the IP above in a browser to test.");
  }

  server.handleClient();

  // Read the thermocouple once per second (the MAX6675 needs >= 220 ms between reads)
  if (millis() - lastReading >= 1000) {
    lastReading = millis();
    temperature = thermocouple.readCelsius();

    Serial.print("Temperature: ");
    if (isnan(temperature)) {
      Serial.println("thermocouple error");
    } else {
      Serial.print(temperature);
      Serial.println(" C");
    }
  }
}
```

---

### Appendix B: Wi-Fi Credentials Template (`secrets.h.example`)

```cpp
// Copy this file to "secrets.h" (same folder) and fill in your own values.
// secrets.h is listed in .gitignore and must NEVER be committed.

#pragma once

#define WIFI_SSID     "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
```

---

### Appendix C: Simulator Add-on Source (`esp32-temperature.js`)

```javascript
/**
 * ESP32 thermocouple -> Core Body Temperature (thermoregulation)
 *
 * Adds a small "ESP32 LIVE" panel to the Thermoregulation tab. When it is
 * switched on, it polls http://<ESP32_IP>/temperatura once per second and
 * writes the value into the existing #temp-num field. Everything else in the
 * simulator (packet builder, JSON preview, stream, presets, anatomy map) keeps
 * working unchanged, because it still reads the same field.
 *
 * Rules (telemetry-v1.1):
 *   - core_temp_c must be between 30.0 and 44.0 C.
 *   - If the ESP32 does not answer, the thermocouple fails, or the reading is
 *     outside that range, the signal is set to "lost" (core_temp_c is sent as null).
 *
 * Load it AFTER js/app.js in index.html.
 */
document.addEventListener("DOMContentLoaded", () => {
  const POLL_MS = 1000;
  const TIMEOUT_MS = 2000;
  const MIN_C = 30.0;
  const MAX_C = 44.0;
  const STORAGE_KEY = "esp32-temperature-ip";

  const view = document.getElementById("view-thermoregulation");
  const tempNum = document.getElementById("temp-num");
  const tempSlider = document.getElementById("temp-slider");
  const tempQuality = document.getElementById("temp-quality");
  if (!view || !tempNum || !tempSlider || !tempQuality) return;

  // --- Panel (inserted at the top of the Thermoregulation tab) ---
  const panel = document.createElement("div");
  panel.className = "bg-astro-deep/80 border border-cyan-400/20 rounded-xl p-4 space-y-2";
  panel.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs font-mono text-cyan-300 uppercase">ESP32 live thermocouple (K-type, MAX6675)</span>
      <label class="flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
        <input type="checkbox" id="esp32-enable" />
        <span>Use ESP32</span>
      </label>
    </div>
    <div class="flex items-center gap-2">
      <label for="esp32-ip" class="text-xs font-mono text-slate-300">ESP32 IP</label>
      <input type="text" id="esp32-ip" placeholder="172.20.10.5"
        class="flex-1 bg-astro-navy border border-cyan-400/30 rounded-lg px-2 py-1 text-sm font-mono text-white" />
    </div>
    <p id="esp32-status" class="text-[11px] font-mono text-slate-400">Off. Manual slider is active.</p>
  `;

  const firstBox = view.querySelector(".bg-astro-deep\\/80");
  if (firstBox) view.insertBefore(panel, firstBox);
  else view.appendChild(panel);

  const enableEl = document.getElementById("esp32-enable");
  const ipEl = document.getElementById("esp32-ip");
  const statusEl = document.getElementById("esp32-status");

  try {
    ipEl.value = localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    /* storage can be unavailable; the field simply starts empty */
  }

  // --- State ---
  let running = false;
  let timerId = null;
  let previousQuality = tempQuality.value;

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className =
      "text-[11px] font-mono " +
      (ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-slate-400");
  }

  function setQuality(value) {
    if (tempQuality.value === value) return;
    tempQuality.value = value;
    // app.js listens to "change": it updates the anatomy map and the JSON preview.
    tempQuality.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setTemperature(celsius) {
    const value = celsius.toFixed(1); // the field uses step 0.1
    tempNum.value = value;
    tempSlider.value = value;
    // app.js listens to "input": it refreshes the JSON preview.
    tempNum.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function baseUrl() {
    let raw = ipEl.value.trim().replace(/\/+$/, "");
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
    return raw;
  }

  async function readOnce() {
    const base = baseUrl();
    if (!base) {
      setQuality("lost");
      setStatus("Type the ESP32 IP (shown in the Arduino serial monitor).", false);
      return;
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${base}/temperatura`, {
        signal: controller.signal,
        cache: "no-store"
      });
      const data = await response.json();

      if (!data.valida || typeof data.temperatura !== "number") {
        setQuality("lost");
        setStatus("ESP32 answered, but the thermocouple reports an error. Sending signal = lost.", false);
      } else if (data.temperatura < MIN_C || data.temperatura > MAX_C) {
        setQuality("lost");
        setStatus(
          `Reading ${data.temperatura.toFixed(1)} C is outside ${MIN_C}-${MAX_C} C. Sending signal = lost.`,
          false
        );
      } else {
        setTemperature(data.temperatura);
        setQuality("good");
        setStatus(`Live: ${data.temperatura.toFixed(1)} C from ${base}`, true);
      }
    } catch {
      setQuality("lost");
      setStatus(
        "No response from the ESP32. Check the IP and that both are on the same Wi-Fi. Signal = lost.",
        false
      );
    } finally {
      clearTimeout(abortTimer);
    }
  }

  async function loop() {
    if (!running) return;
    await readOnce();
    if (running) timerId = setTimeout(loop, POLL_MS);
  }

  function start() {
    try {
      localStorage.setItem(STORAGE_KEY, ipEl.value.trim());
    } catch {
      /* ignore */
    }
    previousQuality = tempQuality.value;
    tempNum.disabled = true;
    tempSlider.disabled = true;
    running = true;
    setStatus("Connecting...", null);
    loop();
  }

  function stop() {
    running = false;
    clearTimeout(timerId);
    timerId = null;
    tempNum.disabled = false;
    tempSlider.disabled = false;
    setQuality(previousQuality);
    setStatus("Off. Manual slider is active.", null);
  }

  enableEl.addEventListener("change", () => (enableEl.checked ? start() : stop()));
});
```

---

### Appendix D: Git Ignore Rule (`.gitignore`)

The `.gitignore` in `firmware/esp32_temperature/` is a 10-byte file that excludes `secrets.h`, so the Wi-Fi password is never committed:

```gitignore
secrets.h
```