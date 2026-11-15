import { useMemo, useState } from "react";
import { describeError } from "../shared/request.js";
import { localized, parseResponse, QUESTIONNAIRES } from "../lib/questionnaires.js";
import { localeOf, useLang } from "../shared/lang.js";
import { useT } from "../shared/useT.js";
import Modal from "./Modal.jsx";
import ResultView from "./ResultView.jsx";
import ScoreRing from "./ScoreRing.jsx";

// Everything this astronaut answered before, newest first. The station sends
// each result as the JSON the front stored; it is unpacked here.
export default function HistoryDialog({ rows, error, onClose }) {
  const t = useT();
  const lang = useLang();
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const when = (iso) =>
    iso ? new Date(iso).toLocaleString(localeOf(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

  const results = useMemo(
    () => (rows ?? []).map((row) => parseResponse(row, lang)).filter((r) => filter === "all" || r.questionnaire === filter),
    [rows, filter, lang]
  );
  const open = results.find((r) => r.id === openId);

  return (
    <Modal title={open ? open.title : t.ui("hTitle")} onClose={onClose}>
      {open ? (
        <>
          <ResultView result={open} />
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={() => setOpenId(null)}>
              {t.ui("hBack")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="seg" role="group" aria-label={t.ui("hQuestionnaire")}>
            {[["all", t.ui("hAll")], ...Object.values(QUESTIONNAIRES).map((q) => [q.id, localized(q, lang).short])].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          {error && !rows && <p className="notice">{describeError(error)}</p>}
          {rows && !results.length && <p className="muted">{t.ui("hNothing")}</p>}
          <ul className="history">
            {results.map((result) => (
              <li key={result.id}>
                <button type="button" onClick={() => setOpenId(result.id)}>
                  <ScoreRing score={result.score} max={result.max} level={result.level} size={46} />
                  <span className="history-main">
                    <strong>{result.title}</strong>
                    <time dateTime={result.answeredAt}>{when(result.answeredAt)}</time>
                  </span>
                  <span className={`level-tag level-${result.level ?? "none"}`}>
                    {result.level ? t.levelWord(result.level) : "–"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
