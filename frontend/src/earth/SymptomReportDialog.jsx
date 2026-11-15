import { useState } from "react";
import Modal from "../components/Modal.jsx";
import { connection } from "../connection.js";
import { describeError } from "../shared/request.js";
import { useT } from "../shared/useT.js";
import { symptoms } from "./surveyApi.js";

// Values accepted by the station (POST /api/crew/{id}/symptom-report). `symptom` and `severity` are fixed lists.
const SYMPTOMS = ["pain", "headache", "nausea", "dizziness", "fatigue", "fever", "breathing_difficulty", "chest_pain", "vision", "mood", "injury", "other"];
const SEVERITIES = [["mild", "green"], ["moderate", "orange"], ["severe", "red"]];
const AREAS = ["head", "chest", "abdomen", "back", "arm", "leg", "eyes", "general"];

// Which body areas make sense for each symptom (a headache cannot be in a leg). `null` = any area.
const AREAS_OF = {
  pain: null,
  injury: null,
  other: null,
  headache: ["head"],
  nausea: ["abdomen", "head", "general"],
  dizziness: ["head", "general"],
  fatigue: ["general"],
  fever: ["general"],
  breathing_difficulty: ["chest", "general"],
  chest_pain: ["chest"],
  vision: ["eyes", "head"],
  mood: ["head", "general"],
};
const fits = (symptom, area) => !symptom || !area || !AREAS_OF[symptom] || AREAS_OF[symptom].includes(area);

/**
 * Form to send an alert (symptom report) to the ground. The body is exactly the contract of the station:
 *   { symptom, severity, body_area, description, reported_by }
 */
export default function SymptomReportDialog({ astronautId, reporter, onClose }) {
  const t = useT();
  const [form, setForm] = useState({ symptom: "", severity: "", body_area: "", description: "", reported_by: reporter ?? "" });
  const [sending, setSending] = useState({ state: "idle", error: null });
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  // Choosing a symptom drops an area that does not fit it, and picks the area itself when only one fits.
  const pickSymptom = (symptom) =>
    setForm((prev) => {
      const allowed = AREAS_OF[symptom];
      let area = fits(symptom, prev.body_area) ? prev.body_area : "";
      if (!area && allowed?.length === 1) area = allowed[0];
      return { ...prev, symptom, body_area: area };
    });
  const pickArea = (area) =>
    setForm((prev) => {
      const next = prev.body_area === area ? "" : area;
      return { ...prev, body_area: next, symptom: fits(prev.symptom, next) ? prev.symptom : "" };
    });
  const ready = form.symptom && form.severity && fits(form.symptom, form.body_area);

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || sending.state === "sending") return;
    setSending({ state: "sending", error: null });
    const body = {
      symptom: form.symptom,
      severity: form.severity,
      body_area: form.body_area || null,
      description: form.description.trim() || null,
      reported_by: form.reported_by.trim() || null,
    };
    try {
      await symptoms.send(astronautId, body);
      setSending({ state: "sent", error: null });
    } catch (error) {
      setSending({ state: "error", error });
      if (error.status === 0) connection.warn();
    }
  };

  if (sending.state === "sent") {
    return (
      <Modal title={t.ui("sdSentTitle")} onClose={onClose}>
        <div className="alert-sent" role="status">
          <span className="alert-sent-icon" aria-hidden="true">✓</span>
          <p>{t.ui("sdSentText")}</p>
        </div>
        <div className="modal-actions">
          <span />
          <button type="button" className="button" onClick={onClose}>{t.ui("close")}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t.ui("sdTitle")} onClose={onClose}>
      <form className="alert-form" onSubmit={submit}>
        <p className="quiz-intro">{t.ui("sdIntro")}</p>

        <fieldset>
          <legend>{t.ui("sdSymptom")}</legend>
          <div className="chip-row">
            {SYMPTOMS.map((value) => (
              <label
                key={value}
                className={`chip${form.symptom === value ? " is-chosen" : ""}${fits(value, form.body_area) ? "" : " is-blocked"}`}
                title={fits(value, form.body_area) ? undefined : t.ui("sdBlockedArea", { x: t.bodyArea(form.body_area) })}
              >
                <input type="radio" name="symptom" value={value} checked={form.symptom === value}
                       disabled={!fits(value, form.body_area)} onChange={() => pickSymptom(value)} />
                {t.symptom(value)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t.ui("sdSeverity")}</legend>
          <div className="severity-row">
            {SEVERITIES.map(([value, level]) => (
              <label key={value} className={`severity level-${level}${form.severity === value ? " is-chosen" : ""}`}>
                <input type="radio" name="severity" value={value} checked={form.severity === value} onChange={() => set("severity")(value)} />
                {t.symptomSeverity(value)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t.ui("sdArea")} <small>({t.ui("sdOptional")}{form.symptom && AREAS_OF[form.symptom] ? ` · ${t.ui("sdAreaHint")}` : ""})</small></legend>
          <div className="chip-row">
            {AREAS.map((value) => (
              <label
                key={value}
                className={`chip${form.body_area === value ? " is-chosen" : ""}${fits(form.symptom, value) ? "" : " is-blocked"}`}
                title={fits(form.symptom, value) ? undefined : t.ui("sdBlockedSymptom", { x: t.symptom(form.symptom) })}
              >
                <input
                  type="radio"
                  name="body_area"
                  value={value}
                  checked={form.body_area === value}
                  disabled={!fits(form.symptom, value)}
                  onClick={() => form.body_area === value && pickArea(value)}
                  onChange={() => pickArea(value)}
                />
                {t.bodyArea(value)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>{t.ui("sdDescription")} <small>({t.ui("sdOptional")})</small></span>
          <textarea rows={4} maxLength={4000} value={form.description} placeholder={t.ui("sdDescriptionPlaceholder")}
                    onChange={(e) => set("description")(e.target.value)} />
        </label>

        <label className="field">
          <span>{t.ui("sdReportedBy")}</span>
          <input type="text" maxLength={80} value={form.reported_by} onChange={(e) => set("reported_by")(e.target.value)} />
        </label>

        {sending.state === "error" && (
          <p className="notice" role="alert">{t.ui("sdError")} {describeError(sending.error)}</p>
        )}

        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>{t.ui("sdCancel")}</button>
          <button type="submit" className="button" disabled={!ready || sending.state === "sending"}>
            {sending.state === "sending" ? t.ui("sdSending") : t.ui("sdSend")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
