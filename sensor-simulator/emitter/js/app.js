/**
 * Main Sensor Simulator Controller
 * Builds payloads matching telemetry-v1.1 and sends them to the Space Station (:8001)
 */
document.addEventListener("DOMContentLoaded", () => {
  let packetCounter = 1;
  let streamTimer = null;
  let oneShotSource = null;

  const apiClient = new TelemetryApiClient(document.getElementById("http-status"));
  const anatomyMap = new AnatomyMapController();

  // Set default assessment date to today (YYYY-MM-DD)
  document.getElementById("daily-date").value = new Date().toISOString().split("T")[0];

  // Pair range sliders with number inputs
  const pairedControls = [
    ["hr-slider", "hr-num"],
    ["spo2-slider", "spo2-num"],
    ["rr-slider", "rr-num"],
    ["temp-slider", "temp-num"],
    ["rad-rate-slider", "rad-rate-num"],
    ["spe-dose-slider", "spe-dose-num"],
    ["sleep-slider", "sleep-num"],
    ["pvt-slider", "pvt-num"],
  ];

  pairedControls.forEach(([sliderId, numId]) => {
    const slider = document.getElementById(sliderId);
    const num = document.getElementById(numId);
    slider.addEventListener("input", () => {
      num.value = slider.value;
      refreshPreview();
    });
    num.addEventListener("input", () => {
      slider.value = num.value;
      refreshPreview();
    });
  });

  // Enable/disable Blood Pressure fields
  const bpInclude = document.getElementById("bp-include");
  bpInclude.addEventListener("change", () => {
    document.getElementById("bp-sys").disabled = !bpInclude.checked;
    document.getElementById("bp-dia").disabled = !bpInclude.checked;
    refreshPreview();
  });

  // Enable/disable Daily Assessment fields
  const dailyInclude = document.getElementById("daily-include");
  dailyInclude.addEventListener("change", () => {
    ["daily-date", "daily-quality", "sleep-slider", "sleep-num", "pvt-slider", "pvt-num"].forEach(
      (id) => {
        document.getElementById(id).disabled = !dailyInclude.checked;
      }
    );
    refreshPreview();
  });

  // Sync signal_quality selectors with SVG organ styling & null rules
  document.querySelectorAll("[data-quality-target]").forEach((selectEl) => {
    selectEl.addEventListener("change", () => {
      anatomyMap.updateZoneQuality(selectEl.dataset.qualityTarget, selectEl.value);
      refreshPreview();
    });
  });

  document.getElementById("daily-quality").addEventListener("change", (e) => {
    anatomyMap.updateZoneQuality("daily_assessment", e.target.value);
    refreshPreview();
  });

  // Re-render preview on any general input change
  document.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("change", refreshPreview);
  });

  // Build strict telemetry-v1.1.json object
  function buildTelemetryPacket(incrementId = false) {
    const now = new Date();
    const dateCompact = now.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = String(packetCounter).padStart(4, "0");
    if (incrementId) packetCounter += 1;

    // Ajuste 1: Formato ISO UTC sin milisegundos (ej. 2026-11-14T17:30:00Z)
    const measuredAtIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");

    const cvQuality = document.getElementById("cv-quality").value;
    const respQuality = document.getElementById("resp-quality").value;
    const tempQuality = document.getElementById("temp-quality").value;
    const radQuality = document.getElementById("rad-quality").value;
    const includeBp = document.getElementById("bp-include").checked;

    // Enforce rule: if signal_quality === "lost", sensor values MUST be null
    const cvLost = cvQuality === "lost";
    const respLost = respQuality === "lost";
    const tempLost = tempQuality === "lost";
    const radLost = radQuality === "lost";

    let dailyAssessmentBlock = null;
    if (document.getElementById("daily-include").checked) {
      const dailyQuality = document.getElementById("daily-quality").value;
      const dailyLost = dailyQuality === "lost";
      dailyAssessmentBlock = {
        assessment_date: document.getElementById("daily-date").value,
        sleep_hours_last_night: dailyLost ? null : parseFloat(document.getElementById("sleep-num").value),
        pvt_reaction_time_ms: dailyLost ? null : parseInt(document.getElementById("pvt-num").value, 10),
        sensor_hardware: "Actiwatch / PVT-B",
        signal_quality: dailyQuality,
      };
    }

    const co2Raw = document.getElementById("cabin-co2").value;

    return {
      schema_version: "1.1",
      header: {
        packet_id: `TLM-${dateCompact}-${seq}`,
        astronaut_id: document.getElementById("astronaut-id").value.trim() || "AST-01",
        measured_at: measuredAtIso,
        source: oneShotSource || "automated_sensor_stream",
      },
      mission_context: {
        activity_state: document.getElementById("activity-state").value,
        comm_latency_sec: parseFloat(document.getElementById("comm-latency").value) || 0,
        environment: {
          cabin_co2_mmhg: co2Raw === "" ? null : parseFloat(co2Raw),
        },
      },
      biometrics: {
        cardiovascular: {
          heart_rate_bpm: cvLost ? null : parseInt(document.getElementById("hr-num").value, 10),
          blood_pressure_systolic_mmhg:
            cvLost || !includeBp ? null : parseInt(document.getElementById("bp-sys").value, 10),
          blood_pressure_diastolic_mmhg:
            cvLost || !includeBp ? null : parseInt(document.getElementById("bp-dia").value, 10),
          sensor_hardware: includeBp ? "Bio-Monitor ECG + Finapres" : "Bio-Monitor ECG",
          signal_quality: cvQuality,
        },
        respiratory: {
          spo2_percent: respLost ? null : parseFloat(document.getElementById("spo2-num").value),
          respiratory_rate_rpm: respLost ? null : parseInt(document.getElementById("rr-num").value, 10),
          sensor_hardware: "Pulse Oximeter",
          signal_quality: respQuality,
        },
        thermoregulation: {
          core_temp_c: tempLost ? null : parseFloat(document.getElementById("temp-num").value),
          sensor_hardware: "Double Sensor Forehead",
          signal_quality: tempQuality,
        },
      },
      daily_assessment: dailyAssessmentBlock,
      radiation_dosimetry: {
        daily_rate_msv: radLost ? null : parseFloat(document.getElementById("rad-rate-num").value),
        solar_particle_event: {
          active: document.getElementById("spe-active").checked,
          event_dose_msv: radLost ? null : parseFloat(document.getElementById("spe-dose-num").value),
        },
        sensor_hardware: "RAD / Liulin Active Dosimeter",
        signal_quality: radQuality,
      },
    };
  }

  function refreshPreview() {
    const packet = buildTelemetryPacket(false);
    document.getElementById("json-preview").textContent = JSON.stringify(packet, null, 2);
  }

  // Ajuste 2a: Enviar paquete junto con el encabezado X-Actor
  async function transmitPacket(sourceOverride = null) {
    oneShotSource = sourceOverride;
    const packet = buildTelemetryPacket(true);
    oneShotSource = null;
    document.getElementById("json-preview").textContent = JSON.stringify(packet, null, 2);

    const endpoint = document.getElementById("api-endpoint").value.trim();
    const actor = (document.getElementById("actor-name")?.value || "Simulador").trim();
    await apiClient.sendPacket(endpoint, packet, actor);
  }

  // Ajuste 2b: Botón Ping Health (/api/health)
  const btnHealth = document.getElementById("btn-check-health");
  if (btnHealth) {
    btnHealth.addEventListener("click", () => {
      const endpoint = document.getElementById("api-endpoint").value.trim();
      apiClient.checkHealth(endpoint);
    });
  }

  // One-shot Cuff Blood Pressure reading
  document.getElementById("btn-trigger-bp").addEventListener("click", async () => {
    const prevChecked = bpInclude.checked;
    bpInclude.checked = true;
    document.getElementById("bp-sys").disabled = false;
    document.getElementById("bp-dia").disabled = false;

    await transmitPacket("periodic_device_trigger");

    bpInclude.checked = prevChecked;
    document.getElementById("bp-sys").disabled = !prevChecked;
    document.getElementById("bp-dia").disabled = !prevChecked;
    refreshPreview();
  });

  // One-shot Daily Assessment report
  document.getElementById("btn-trigger-daily").addEventListener("click", async () => {
    const prevChecked = dailyInclude.checked;
    dailyInclude.checked = true;

    await transmitPacket("periodic_device_trigger");

    dailyInclude.checked = prevChecked;
    refreshPreview();
  });

  // Manual single packet push
  document.getElementById("btn-send-once").addEventListener("click", () => {
    transmitPacket("manual_override");
  });

  // Continuous Stream Toggle
  const btnToggleStream = document.getElementById("btn-toggle-stream");
  const indicator = document.getElementById("stream-indicator");

  function stopStream() {
    clearInterval(streamTimer);
    streamTimer = null;
    btnToggleStream.textContent = "Start Stream";
    btnToggleStream.classList.remove("streaming");
    indicator.classList.remove("live");
  }

  function startStream() {
    const rateMs = parseInt(document.getElementById("stream-interval").value, 10);
    transmitPacket();
    streamTimer = setInterval(() => transmitPacket(), rateMs);
    btnToggleStream.textContent = "Stop Stream";
    btnToggleStream.classList.add("streaming");
    indicator.classList.add("live");
  }

  btnToggleStream.addEventListener("click", () => {
    if (streamTimer) stopStream();
    else startStream();
  });

  document.getElementById("stream-interval").addEventListener("change", () => {
    if (streamTimer) {
      stopStream();
      startStream();
    }
  });

  // Apply Scenario Presets
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const p = SIMULATOR_PRESETS[btn.dataset.preset];
      if (!p) return;

      document.getElementById("activity-state").value = p.activity_state;
      document.getElementById("comm-latency").value = p.comm_latency_sec;
      document.getElementById("cabin-co2").value = p.cabin_co2_mmhg;

      // Cardiovascular
      document.getElementById("hr-slider").value = p.cardiovascular.heart_rate_bpm;
      document.getElementById("hr-num").value = p.cardiovascular.heart_rate_bpm;
      bpInclude.checked = p.cardiovascular.include_bp;
      document.getElementById("bp-sys").value = p.cardiovascular.blood_pressure_systolic_mmhg;
      document.getElementById("bp-dia").value = p.cardiovascular.blood_pressure_diastolic_mmhg;
      document.getElementById("bp-sys").disabled = !p.cardiovascular.include_bp;
      document.getElementById("bp-dia").disabled = !p.cardiovascular.include_bp;
      document.getElementById("cv-quality").value = p.cardiovascular.signal_quality;
      anatomyMap.updateZoneQuality("cardiovascular", p.cardiovascular.signal_quality);

      // Respiratory
      document.getElementById("spo2-slider").value = p.respiratory.spo2_percent;
      document.getElementById("spo2-num").value = p.respiratory.spo2_percent;
      document.getElementById("rr-slider").value = p.respiratory.respiratory_rate_rpm;
      document.getElementById("rr-num").value = p.respiratory.respiratory_rate_rpm;
      document.getElementById("resp-quality").value = p.respiratory.signal_quality;
      anatomyMap.updateZoneQuality("respiratory", p.respiratory.signal_quality);

      // Thermoregulation
      document.getElementById("temp-slider").value = p.thermoregulation.core_temp_c;
      document.getElementById("temp-num").value = p.thermoregulation.core_temp_c;
      document.getElementById("temp-quality").value = p.thermoregulation.signal_quality;
      anatomyMap.updateZoneQuality("thermoregulation", p.thermoregulation.signal_quality);

      // Radiation
      document.getElementById("rad-rate-slider").value = p.radiation.daily_rate_msv;
      document.getElementById("rad-rate-num").value = p.radiation.daily_rate_msv;
      document.getElementById("spe-active").checked = p.radiation.spe_active;
      document.getElementById("spe-dose-slider").value = p.radiation.event_dose_msv;
      document.getElementById("spe-dose-num").value = p.radiation.event_dose_msv;
      document.getElementById("rad-quality").value = p.radiation.signal_quality;
      anatomyMap.updateZoneQuality("radiation", p.radiation.signal_quality);

      // Daily Assessment
      dailyInclude.checked = p.daily_assessment.include;
      dailyInclude.dispatchEvent(new Event("change"));
      document.getElementById("sleep-slider").value = p.daily_assessment.sleep_hours_last_night;
      document.getElementById("sleep-num").value = p.daily_assessment.sleep_hours_last_night;
      document.getElementById("pvt-slider").value = p.daily_assessment.pvt_reaction_time_ms;
      document.getElementById("pvt-num").value = p.daily_assessment.pvt_reaction_time_ms;
      document.getElementById("daily-quality").value = p.daily_assessment.signal_quality;
      anatomyMap.updateZoneQuality("daily_assessment", p.daily_assessment.signal_quality);

      refreshPreview();
    });
  });

  // Real-time Galaxy Watch BLE stream -> Auto-POST to Space Station (:8001)
  const btnWatch = document.getElementById("btn-connect-watch");
  let lastBleSendTimestamp = 0;

  if (btnWatch && "bluetooth" in navigator) {
    btnWatch.addEventListener("click", async () => {
      try {
        btnWatch.textContent = "Scanning Watch...";
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ["heart_rate"] }],
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService("heart_rate");
        const characteristic = await service.getCharacteristic("heart_rate_measurement");

        await characteristic.startNotifications();
        btnWatch.textContent = `LIVE: ${device.name || "Galaxy Watch"}`;
        btnWatch.classList.add("border-emerald-400", "bg-emerald-950/60");

        characteristic.addEventListener("characteristicvaluechanged", async (event) => {
          const value = event.target.value;
          const flags = value.getUint8(0);
          const bpm = (flags & 0x01) !== 0 ? value.getUint16(1, true) : value.getUint8(1);

          if (bpm >= 20 && bpm <= 250) {
            document.getElementById("hr-slider").value = bpm;
            document.getElementById("hr-num").value = bpm;
            document.getElementById("cv-quality").value = "good";
            anatomyMap.updateZoneQuality("cardiovascular", "good");
            refreshPreview();

            // Enforce Space Station rule: max 1 packet per second per astronaut
            const now = Date.now();
            if (!streamTimer && now - lastBleSendTimestamp >= 1100) {
              lastBleSendTimestamp = now;
              await transmitPacket("automated_sensor_stream");
            }
          }
        });

        device.addEventListener("gattserverdisconnected", () => {
          btnWatch.textContent = "Connect Watch (Live BLE)";
          btnWatch.classList.remove("border-emerald-400", "bg-emerald-950/60");
        });
      } catch (err) {
        console.error("BLE Watch error:", err);
        btnWatch.textContent = "Connect Watch (Live BLE)";
      }
    });
  }

  // Initial render
  refreshPreview();
});