import { useState } from "react";
import { describeError, postJSON } from "../api.js";
import { connection } from "../connection.js";
import { buildPayload, OPTIONS, parseResponse } from "../lib/questionnaires.js";
import Modal from "./Modal.jsx";
import ResultView from "./ResultView.jsx";

// One question at a time. At the end the result is shown and sent to the station.
export default function QuestionnaireDialog({ definition, astronautId, answeredBy, onClose, onSaved }) {
  const count = definition.questions.length;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => definition.questions.map(() => null));
  const [payload, setPayload] = useState(null);
  const [sending, setSending] = useState({ state: "idle", error: null });

  const firstOpen = answers.indexOf(null); // -1 when everything is answered
  const reachable = firstOpen === -1 ? count - 1 : firstOpen;
  const last = step === count - 1;
  const chosen = answers[step];

  const send = async (body) => {
    setSending({ state: "sending", error: null });
    try {
      await postJSON(`/api/crew/${astronautId}/questionnaires`, body);
      setSending({ state: "saved", error: null });
      onSaved();
    } catch (error) {
      // The result stays on screen so nothing is lost; the astronaut can retry.
      setSending({ state: "error", error });
      if (error.unreachable) connection.warn();
    }
  };

  const finish = (event) => {
    event.preventDefault();
    if (firstOpen !== -1) return;
    const body = buildPayload({ definition, answers, astronautId, answeredBy });
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
          <div className="steps" role="group" aria-label="Questions">
            {definition.questions.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`${answers[index] !== null ? "is-done" : ""}${index === step ? " is-current" : ""}`}
                aria-label={`Question ${index + 1}`}
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
                Question {step + 1} of {count}
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
              Back
            </button>
            {last ? (
              <button type="submit" className="button" disabled={firstOpen !== -1}>
                See my result
              </button>
            ) : (
              <button type="button" className="button" disabled={chosen === null} onClick={() => setStep(step + 1)}>
                Next
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <ResultView result={parseResponse({ response: payload })} />
          <div className="send-status" role="status">
            {sending.state === "sending" && <p className="muted">Sending to the station…</p>}
            {sending.state === "saved" && <p className="ok">Saved on the station.</p>}
            {sending.state === "error" && (
              <p className="notice">
                Could not send the result to the station. {describeError(sending.error)}{" "}
                <button type="button" className="link-button" onClick={() => send(payload)}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={again}>
              Answer again
            </button>
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
