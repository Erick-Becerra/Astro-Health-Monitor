import { worst } from "./levels.js";

export const SYSTEM_REGIONS = {
  heart: ["heart", "vessels"],
  lungs: ["lungs", "airway"],
  brain: ["brain"],
  metabolism: ["liver", "stomach"],
  thermal: ["skin"],
  radiation: ["skin"],

  bones: ["skeleton"],
  eyes: ["eyes"],
};

export const regionSystem = (region) =>
  Object.keys(SYSTEM_REGIONS).find((system) => SYSTEM_REGIONS[system].includes(region)) ?? null;

const format = (driver) => {
  const value = driver.value == null ? "no value" : `${driver.value}${driver.unit ? ` ${driver.unit}` : ""}`;
  return `${driver.label}: ${value}`;
};

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

export const FOCUS_REGIONS = { ...SYSTEM_REGIONS, thermal: ["thermal"] };
