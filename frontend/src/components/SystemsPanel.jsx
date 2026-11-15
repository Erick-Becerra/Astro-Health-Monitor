import { LEVEL_TEXT } from "../lib/levels.js";
import { SYSTEM_REGIONS } from "../lib/bodyFlags.js";

// The eight body systems, each with the level and the NASA hazard it came from.
// Clicking one selects its first part on the body diagram.
export default function SystemsPanel({ systems, selectedSystem, onSelect }) {
  return (
    <ul className="systems">
      {systems.map((system) => (
        <li key={system.system}>
          <button
            type="button"
            className={selectedSystem === system.system ? "is-selected" : ""}
            onClick={() => onSelect(SYSTEM_REGIONS[system.system]?.[0] ?? null)}
          >
            <span className={`dot level-${system.level ?? "none"}`} aria-hidden="true" />
            <span className="system-name">{system.label}</span>
            <span className={`level-tag level-${system.level ?? "none"}`}>{LEVEL_TEXT[system.level] ?? "–"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
