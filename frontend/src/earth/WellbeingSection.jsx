import { useEffect, useState } from "react";
import { needsBackend } from "../connection.js";
import HistoryDialog from "../components/HistoryDialog.jsx";
import QuestionnaireDialog from "../components/QuestionnaireDialog.jsx";
import WellbeingPanel from "../components/WellbeingPanel.jsx";
import { QUESTIONNAIRES } from "../lib/questionnaires.js";
import { usePolling } from "../shared/hooks.js";
import { useT } from "../shared/useT.js";
import { surveys } from "./surveyApi.js";

export default function WellbeingSection({ astronautId, answeredBy }) {
  const t = useT();
  const [dialog, setDialog] = useState(null);
  const [now, setNow] = useState(Date.now);
  const rows = usePolling(() => surveys.list(astronautId, { limit: 50 }), { seconds: 30, deps: [astronautId] });

  useEffect(() => setDialog(null), [astronautId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="wellbeing-section">
      <div className="wellbeing-head">
        <h3 className="hud-label">{t.ui("wbTitle")}</h3>
        <button type="button" className="link-button" onClick={needsBackend(() => setDialog({ type: "history" }))}>
          {t.ui("wbSeePast")}
        </button>
      </div>
      <WellbeingPanel
        rows={rows.data ?? null}
        now={now}
        offline={rows.error && !rows.data}
        onAnswer={needsBackend((questionnaire) => setDialog({ type: "form", questionnaire }))}
      />
      {dialog?.type === "form" && (
        <QuestionnaireDialog
          key={dialog.questionnaire}
          definition={QUESTIONNAIRES[dialog.questionnaire]}
          astronautId={astronautId}
          answeredBy={answeredBy ?? astronautId}
          onClose={() => setDialog(null)}
          onSaved={rows.refresh}
        />
      )}
      {dialog?.type === "history" && <HistoryDialog rows={rows.data ?? null} error={rows.error} onClose={() => setDialog(null)} />}
    </section>
  );
}
