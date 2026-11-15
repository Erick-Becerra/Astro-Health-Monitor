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
 *  - core_temp_c must be between 30.0 and 44.0 C.
 *  - If the ESP32 does not answer, the thermocouple fails, or the reading is
 *    outside that range, the signal is set to "lost" (core_temp_c is sent as null).
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

  // ---- Panel (inserted at the top of the Thermoregulation tab) ----
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

  // ---- State ----
  let running = false;
  let timerId = null;
  let previousQuality = tempQuality.value;

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className =
      "text-[11px] font-mono " + (ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-slate-400");
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
      const response = await fetch(`${base}/temperatura`, { signal: controller.signal, cache: "no-store" });
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
      setStatus("No response from the ESP32. Check the IP and that both are on the same Wi-Fi. Signal = lost.", false);
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
