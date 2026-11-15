/**
 * Handles organ/system selection on the SVG human silhouette
 * and updates visual signal quality states (good, degraded, lost).
 */
class AnatomyMapController {
  constructor(onSystemSelect) {
    this.onSystemSelect = onSystemSelect;
    this.zones = document.querySelectorAll(".organ-zone");
    this.tabs = document.querySelectorAll(".sys-tab");
    this.views = document.querySelectorAll(".control-view");
    this.bindEvents();
  }

  bindEvents() {
    this.zones.forEach((zone) => {
      zone.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectSystem(zone.dataset.system);
      });
    });

    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.selectSystem(tab.dataset.system);
      });
    });
  }

  selectSystem(systemName) {
    this.zones.forEach((z) => z.classList.toggle("active", z.dataset.system === systemName));
    this.tabs.forEach((t) => t.classList.toggle("active", t.dataset.system === systemName));
    this.views.forEach((v) => v.classList.toggle("active", v.id === `view-${systemName}`));

    if (typeof this.onSystemSelect === "function") {
      this.onSystemSelect(systemName);
    }
  }

  updateZoneQuality(systemName, quality) {
    const zone = document.getElementById(`zone-${systemName}`);
    if (!zone) return;
    zone.classList.remove("good", "degraded", "lost");
    zone.classList.add(quality);
  }
}