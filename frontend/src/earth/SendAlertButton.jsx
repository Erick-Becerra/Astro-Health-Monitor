import { useState } from "react";
import { needsBackend } from "../connection.js";
import { useT } from "../shared/useT.js";
import SymptomReportDialog from "./SymptomReportDialog.jsx";

/**
 * "Send alert": reports a symptom to the ground. It lives in the bottom right corner, next to the settings button,
 * so it can be reached from every tab. It needs an astronaut to be selected (the report is about one of them).
 */
export default function SendAlertButton({ astronautId, reporter }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="alert-pill" disabled={!astronautId} title={t.ui("sdCtaText")}
              onClick={needsBackend(() => setOpen(true))}>
        <span className="alert-pill-icon" aria-hidden="true">!</span>
        {t.ui("sdTitle")}
      </button>
      {open && astronautId && <SymptomReportDialog astronautId={astronautId} reporter={reporter} onClose={() => setOpen(false)} />}
    </>
  );
}
