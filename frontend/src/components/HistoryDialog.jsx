import { useMemo, useState } from "react";
import { describeError } from "../api.js";
import { LEVEL_TEXT } from "../lib/levels.js";
import { parseResponse, QUESTIONNAIRES } from "../lib/questionnaires.js";
import Modal from "./Modal.jsx";
import ResultView from "./ResultView.jsx";
import ScoreRing from "./ScoreRing.jsx";

const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

// Everything this astronaut answered before, newest first. The station sends
// each result as the JSON the front stored; it is unpacked here.
export default function HistoryDialog({ rows, error, onClose }) {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  const results = useMemo(
    () => (rows ?? []).map((row) => parseResponse(row)).filter((r) => filter === "all" || r.questionnaire === filter),
    [rows, filter]
  );
  const open = results.find((r) => r.id === openId);

  return (
    <Modal title={open ? open.title : "Past answers"} onClose={onClose}>
      {open ? (
        <>
          <ResultView result={open} />
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={() => setOpenId(null)}>
              Back to the list
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Questionnaire">
            {[["all", "All"], ...Object.values(QUESTIONNAIRES).map((q) => [q.id, q.short])].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          {error && !rows && <p className="notice">{describeError(error)}</p>}
          {rows && !results.length && <p className="muted">Nothing answered yet.</p>}
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
                    {result.level ? LEVEL_TEXT[result.level] : "–"}
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
