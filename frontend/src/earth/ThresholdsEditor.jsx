import { useState } from "react";
import { describeError } from "../shared/request.js";

const LEVELS = ["yellow", "orange", "red"];
const norm = (o) => (o ? LEVELS.map((l) => o[l] ?? "").join("|") : "");

/**
 * Editor of the personal thresholds of one astronaut. The data is GET /api/astronauts/{id}/thresholds:
 *   { version, personal: {indicator: {yellow, orange, red}}, adjustable: {indicator: {label, unit, default: {...}}} }
 * A value at or above each number gets that colour. The default is shown as a hint; leaving the three boxes of an
 * indicator empty means "use the default". Only what changed is sent (the backend refuses unordered values with a
 * message, and that message is shown).
 *
 *   <ThresholdsEditor data={thresholds} t={t} onSave={(patch) => earth.putThresholds(id, patch, actor).then(reload)} />
 */
export default function ThresholdsEditor({ data, t, onSave }) {
  const [message, setMessage] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch = {};
    for (const key of Object.keys(data.adjustable)) {
      const levels = {};
      for (const level of LEVELS) {
        const raw = form.get(`${key}.${level}`);
        if (raw !== null && raw !== "") levels[level] = Number(raw);
      }
      const after = Object.keys(levels).length ? levels : null; // null = back to the default
      if (norm(data.personal[key]) !== norm(after)) patch[key] = after;
    }
    if (!Object.keys(patch).length) return setMessage("Sin cambios");
    try {
      await onSave(patch);
      setMessage("Guardado. Llegará a la estación después de la latencia del enlace.");
    } catch (error) {
      setMessage(describeError(error)); // for example "yellow < orange < red is required"
    }
    return undefined;
  };

  return (
    <form className="thresholds" onSubmit={submit}>
      <table>
        <thead>
          <tr><th /><th>{t.level("yellow")}</th><th>{t.level("orange")}</th><th>{t.level("red")}</th></tr>
        </thead>
        <tbody>
          {Object.entries(data.adjustable).map(([key, info]) => (
            <tr key={key}>
              <th scope="row">{t.indicator(key)} ({t.unit(key) || info.unit})</th>
              {LEVELS.map((level) => (
                <td key={level}>
                  <input name={`${key}.${level}`} type="number" step="any" defaultValue={data.personal[key]?.[level] ?? ""}
                         placeholder={info.default[level] === undefined ? "" : String(info.default[level])}
                         aria-label={`${t.indicator(key)} ${t.level(level)}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t.ui("defaultThreshold")}: gris. Deje las tres casillas vacías para usar el valor por defecto.</p>
      <button>{t.ui("save")}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
