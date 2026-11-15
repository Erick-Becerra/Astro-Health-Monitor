import { useState } from "react";
import { describeError } from "../shared/request.js";
import { earth } from "./earthApi.js";
import { SECTIONS, buildRecordCsv, dailyEnergy, downloadCsv, goalsPatch, nextAstronautId, profilePatch, recordTemplateCsv } from "./recordCsv.js";

function Field({ f, value, onChange, disabled }) {
  const common = { id: f.key, value: value ?? "", disabled, onChange: (e) => onChange(f.key, e.target.value) };
  let input;
  if (f.type === "select") {
    input = (
      <select {...common}>
        <option value="">—</option>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.type === "textarea") {
    input = <textarea rows={3} {...common} />;
  } else {
    input = <input type={f.type} step={f.type === "number" ? "any" : undefined} {...common} />;
  }
  return (
    <label className={`field${f.wide ? " wide" : ""}`}>
      <span>{f.label}{f.unit ? ` (${f.unit})` : ""}{f.required ? " *" : ""}</span>
      {input}
    </label>
  );
}

/**
 * Registers a new astronaut (mode "new") or edits one (mode "edit"). Saves the profile and goals through the API
 * and can also upload the filled data as a record CSV (a new version).
 *
 *   <NewAstronautForm mode="new" existingIds={ids} actor={actor} onClose={...} onSaved={(id) => ...} />
 *   <NewAstronautForm mode="edit" initial={{ astronaut_id, ...fields }} ... />
 */
export default function NewAstronautForm({ mode = "new", existingIds = [], initial = {}, actor, onClose, onSaved }) {
  const editing = mode === "edit";
  const [values, setValues] = useState(() => ({ astronaut_id: editing ? initial.astronaut_id : nextAstronautId(existingIds), ...initial }));
  const [saveCsv, setSaveCsv] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const downloadTemplate = () => downloadCsv("astronaut-record-template.csv", recordTemplateCsv());
  const downloadFilled = () => downloadCsv(`record-${String(values.astronaut_id || "astronaut").trim()}.csv`, buildRecordCsv(values));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    const id = String(values.astronaut_id ?? "").trim();
    if (!id || id.length > 32) return setError("The ID must have 1 to 32 characters.");
    if (/\s|\//.test(id)) return setError("The ID cannot contain spaces or slashes.");
    if (!editing && existingIds.includes(id)) return setError("That ID already exists. Choose another one.");
    if (!String(values.name ?? "").trim()) return setError("The name is required.");
    if (!values.agency) return setError("Choose the space agency: it sets the career radiation limit.");
    setSaving(true);
    try {
      await earth.putProfile(id, profilePatch(values), actor);
      const goals = goalsPatch(values);
      if (Object.keys(goals).length) await earth.putExerciseGoals(id, goals, actor);
    } catch (err) {
      setSaving(false);
      return setError(describeError(err));
    }
    if (saveCsv) {
      try {
        const file = new File([buildRecordCsv(values)], `record-${id}.csv`, { type: "text/csv" });
        await earth.uploadRecord(id, file, actor, editing ? "Updated from the form" : "Created from the registration form");
      } catch (err) {
        setSaving(false);
        return setError(`The astronaut was saved, but the record file was not: ${describeError(err)} You can upload it from “Full record”.`);
      }
    }
    setSaving(false);
    return onSaved?.(id);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? "Edit astronaut" : "New astronaut"}>
      <form className="modal-card" onSubmit={submit}>
        <header className="modal-head">
          <h2>{editing ? `Edit ${values.name || values.astronaut_id}` : "New astronaut"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {SECTIONS.map((s) => (
            <fieldset key={s.title}>
              <legend>{s.title}</legend>
              <div className="fields">
                {s.fields.map((f) => (
                  <Field key={f.key} f={f} value={values[f.key]} onChange={set} disabled={editing && f.key === "astronaut_id"} />
                ))}
                {s.title.startsWith("Anthropometry") && (
                  <label className="field">
                    <span>Daily energy requirement (kcal/day, 29 kcal/kg)</span>
                    <input value={dailyEnergy(values)} readOnly />
                  </label>
                )}
              </div>
            </fieldset>
          ))}
        </div>
        {error && <p className="notice" data-kind="error" role="alert">{error}</p>}
        <footer className="modal-foot">
          <label className="check">
            <input type="checkbox" checked={saveCsv} onChange={(e) => setSaveCsv(e.target.checked)} />
            Also save these data as a record file (CSV)
          </label>
          <button type="button" className="link" onClick={downloadFilled}>Download filled CSV</button>
          <button type="button" className="link" onClick={downloadTemplate}>Download empty template</button>
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Register astronaut"}</button>
        </footer>
      </form>
    </div>
  );
}
