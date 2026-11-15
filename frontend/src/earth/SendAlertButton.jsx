import { useState } from "react";
import { needsBackend } from "../connection.js";
import { useT } from "../shared/useT.js";
import SymptomReportDialog from "./SymptomReportDialog.jsx";

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
