import { worst } from "./levels.js";

// Which parts of the body diagram show each body system of the dashboard.
// The backend sends one entry per system (`dashboard.systems`) with its level
// and the drivers that explain it. To change what lights up, edit this table.
export const SYSTEM_REGIONS = {
  heart: ["heart", "vessels"],
  lungs: ["lungs", "airway"],
  brain: ["brain"],
  metabolism: ["liver", "stomach"],
  thermal: ["skin"],
  radiation: ["skin"],
  bones: ["spine", "ribcage"],
  eyes: ["eyes"],
};

// The system a body region belongs to (the first one that lists it).
export const regionSystem = (region) =>
  Object.keys(SYSTEM_REGIONS).find((system) => SYSTEM_REGIONS[system].includes(region)) ?? null;

const format = (driver) => {
  const value = driver.value == null ? "no value" : `${driver.value}${driver.unit ? ` ${driver.unit}` : ""}`;
  return `${driver.label}: ${value}`;
};

// From the dashboard's systems to what the diagram paints.
// Returns { flags: { heart: "red" }, reasons: { heart: ["Heart rate: 131 bpm"] } }.
export function regionFlags(systems = []) {
  const flags = {};
  const reasons = {};

  for (const system of systems) {
    if (!system.level || system.level === "green") continue;
    const regions = SYSTEM_REGIONS[system.system] ?? [];
    for (const region of regions) {
      flags[region] = worst(flags[region], system.level);
      const lines = system.drivers?.length ? system.drivers.map(format) : [`${system.label} is not normal`];
      reasons[region] = [...(reasons[region] ?? []), ...lines];
    }
  }
  return { flags, reasons };
}
