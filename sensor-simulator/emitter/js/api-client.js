/**
 * Dispatches telemetry-v1.1 packets to the Space Station backend (port 8001)
 * following the App 3 integration contract.
 */
class TelemetryApiClient {
  constructor(statusBadgeEl) {
    this.statusBadgeEl = statusBadgeEl;
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel("astro-telemetry-v1.1") : null;
  }

  getBaseUrl(endpointUrl) {
    try {
      const url = new URL(endpointUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return endpointUrl.replace(/\/api\/sim\/packet\/?$/, "");
    }
  }

  async checkHealth(endpointUrl) {
    const baseUrl = this.getBaseUrl(endpointUrl);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        this.setBadge(`ONLINE • ${data.service || "space-station"}`, "ok");
        return true;
      }
      this.setBadge(`HEALTH HTTP ${res.status}`, "err");
      return false;
    } catch {
      this.setBadge("UNREACHABLE • CHECK IP / HOTSPOT / PORT 8001", "err");
      return false;
    }
  }

  async sendPacket(endpointUrl, payload, actor = "Sensor Simulator") {
    if (this.channel) {
      this.channel.postMessage(payload);
    }

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Actor": actor,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail ? JSON.stringify(data.detail) : `HTTP ${response.status}`;
        this.setBadge(`HTTP ${response.status} • REJECTED`, "err");
        console.warn("Station validation error:", detail);
        return null;
      }

      const level = data?.level ? String(data.level).toUpperCase() : "STORED";
      const status = data?.status ? String(data.status).toUpperCase() : "OK";
      this.setBadge(`201 OK • ${level} (${status})`, "ok");
      return data;
    } catch (error) {
      this.setBadge("NO RESPONSE • CHECK IP / PORT 8001", "err");
      return null;
    }
  }

  async sendSimCommand(endpointUrl, path, method = "PUT", body = null, actor = "Sensor Simulator") {
    const baseUrl = this.getBaseUrl(endpointUrl);
    const options = {
      method,
      headers: {
        "content-type": "application/json",
        "X-Actor": actor,
      },
    };
    if (body !== null) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, options);
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err}`);
    }
    return response.json().catch(() => ({ ok: true }));
  }

  setBadge(text, stateClass) {
    if (!this.statusBadgeEl) return;
    this.statusBadgeEl.textContent = text;
    this.statusBadgeEl.className = `http-badge ${stateClass}`;
  }
}