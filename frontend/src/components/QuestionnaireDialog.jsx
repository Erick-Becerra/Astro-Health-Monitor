import { useState } from "react";
import { describeError } from "../shared/request.js";
import { surveys } from "../earth/surveyApi.js";
import { connection } from "../connection.js";
import { buildPayload, localized, optionsFor, parseResponse } from "../lib/questionnaires.js";
import { useLang } from "../shared/lang.js";
import { useT } from "../shared/useT.js";
import Modal from "./Modal.jsx";
import ResultView from "./ResultView.jsx";

export default function QuestionnaireDialog({ definition: base, astronautId, answeredBy, onClose, onSaved }) {
  const t = useT();
  const lang = useLang();
  const definition = localized(base, lang);
  const OPTIONS = optionsFor(lang);
  const count = definition.questions.length;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => definition.questions.map(() => null));
  const [payload, setPayload] = useState(null);
  const [sending, setSending] = useState({ state: "idle", error: null });

  const firstOpen = answers.indexOf(null);
  const reachable = firstOpen === -1 ? count - 1 : firstOpen;
  const last = step === count - 1;
  const chosen = answers[step];

  const send = async (body) => {
    setSending({ state: "sending", error: null });
    try {
      await surveys.save(astronautId, body);
      setSending({ state: "saved", error: null });
      onSaved();
    } catch (error) {
      setSending({ state: "error", error });
      if (error.status === 0) connection.warn();
    }
  };

  const finish = (event) => {
    event.preventDefault();
    if (firstOpen !== -1) return;

    const body = buildPayload({ definition: base, answers, astronautId, answeredBy, language: lang });
    setPayload(body);
    send(body);
  };

  const again = () => {
    setStep(0);
    setAnswers(definition.questions.map(() => null));
    setPayload(null);
    setSending({ state: "idle", error: null });
  };

  return (
    <Modal title={definition.title} onClose={onClose}>
      {!payload ? (
        <form onSubmit={finish} className="quiz">
          <div className="steps" role="group" aria-label={t.ui("qQuestions")}>
            {definition.questions.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`${answers[index] !== null ? "is-done" : ""}${index === step ? " is-current" : ""}`}
                aria-label={t.ui("qQuestionN", { n: index + 1 })}
                aria-current={index === step}
                disabled={index > reachable}
                onClick={() => setStep(index)}
              />
            ))}
          </div>

          <p className="quiz-intro">{definition.intro}</p>

          <fieldset className="quiz-step" key={step}>
            <legend>
              <span className="quiz-count">
                {t.ui("qCount", { n: step + 1, total: count })}
              </span>
              <span className="quiz-question">{definition.questions[step]}</span>
            </legend>
            <div className="choices">
              {OPTIONS.map((option) => (
                <label key={option.value} className={`choice${chosen === option.value ? " is-chosen" : ""}`}>
                  <input
                    type="radio"
                    name={`${definition.id}-${step}`}
                    value={option.value}
                    checked={chosen === option.value}
                    onChange={() => setAnswers((prev) => prev.map((a, i) => (i === step ? option.value : a)))}
                  />
                  <span className="bubble">{option.value}</span>
                  <span className="choice-text">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="button button-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t.ui("qBack")}
            </button>
            {last ? (
              <button type="submit" className="button" disabled={firstOpen !== -1}>
                {t.ui("qSeeResult")}
              </button>
            ) : (
              <button type="button" className="button" disabled={chosen === null} onClick={() => setStep(step + 1)}>
                {t.ui("qNext")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <ResultView result={parseResponse({ response: payload }, lang)} />
          <div className="send-status" role="status">
            {sending.state === "sending" && <p className="muted">{t.ui("qSending")}</p>}
            {sending.state === "saved" && <p className="ok">{t.ui("qSaved")}</p>}
            {sending.state === "error" && (
              <p className="notice">
                {t.ui("qSendError")} {describeError(sending.error)}{" "}
                <button type="button" className="link-button" onClick={() => send(payload)}>
                  {t.ui("qTryAgain")}
                </button>
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={again}>
              {t.ui("qAnswerAgain")}
            </button>
            <button type="button" className="button" onClick={onClose}>
              {t.ui("close")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
