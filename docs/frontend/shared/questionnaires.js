// PHQ-9 and GAD-7: the FRONT writes the questions and works out the score, the severity and the recommendation,
// then sends the JSON to the backend, which keeps it whole (POST /api/crew/{id}/questionnaires).
//
//   const json = buildQuestionnaire({ kind: "phq9", answers, answeredBy: "Sofía Navarro", t });
//   const saved = await station.saveQuestionnaire(astronautId, json, "Sofía Navarro");
//   saved.item9_alert   // true when question 9 of the PHQ-9 is above 0: show the alert
//
// The questions themselves are yours: put them wherever you like. The backend does not need them (if you want them
// kept, add them to the JSON: everything extra is stored as it comes).

/** Items and severity bands of each questionnaire (the same cut-offs the backend uses). */
export const QUESTIONNAIRES = {
  phq9: { items: 9, maxScore: 27, bands: [[4, "minimal"], [9, "mild"], [14, "moderate"], [19, "moderately severe"], [27, "severe"]] },
  gad7: { items: 7, maxScore: 21, bands: [[4, "minimal"], [9, "mild"], [14, "moderate"], [21, "severe"]] },
};

/** Options of every question: the value is what goes in `answers`. */
export const ANSWER_VALUES = [0, 1, 2, 3];

export const scoreOf = (answers) => answers.reduce((sum, a) => sum + a, 0);

/** The severity key of a score ("minimal", "mild", "moderate", "moderately severe", "severe"). t.questionnaireSeverity(key) is its display name. */
export function severityOf(kind, score) {
  const band = QUESTIONNAIRES[kind].bands.find(([upTo]) => score <= upTo);
  return band ? band[1] : QUESTIONNAIRES[kind].bands.at(-1)[1];
}

/** Question 9 of the PHQ-9 (thoughts of self-harm) above zero: it needs an assessment right away. */
export const item9Raised = (kind, answers) => kind === "phq9" && answers[8] > 0;

/**
 * DRAFT recommendation per severity, to be replaced by the text of the clinical team. The table "Proposed
 * Treatment Actions" of the PHQ-9 page (hiv.uw.edu/page/mental-health-screening/phq-9) is the source for the
 * PHQ-9; its GAD-7 page has no table by severity, so those texts have to be agreed with the clinical team.
 */
export const RECOMMENDATIONS = {
  phq9: {
    minimal: "DRAFT: no action required.",
    mild: "DRAFT: monitor and repeat the questionnaire at the next check-up.",
    moderate: "DRAFT: treatment plan; consider counseling and follow-up.",
    "moderately severe": "DRAFT: active treatment; assess with the behavioral health team.",
    severe: "DRAFT: start treatment immediately and refer urgently to a specialist.",
  },
  gad7: {
    minimal: "DRAFT: no action required.",
    mild: "DRAFT: monitor and repeat the questionnaire at the next check-up.",
    moderate: "DRAFT: assessment with the behavioral health team.",
    severe: "DRAFT: priority assessment with the behavioral health team.",
  },
};
const ITEM9_TEXT = " Question 9 is greater than 0: assess the risk of self-harm immediately.";

/** The recommendation of a result (and the extra sentence if question 9 is above 0). */
export function recommendationFor(kind, answers) {
  const base = RECOMMENDATIONS[kind][severityOf(kind, scoreOf(answers))];
  return item9Raised(kind, answers) ? base + ITEM9_TEXT : base;
}

/**
 * The JSON to save. Throws if the answers cannot be right (so a bug of the screen does not reach the backend).
 *   kind            "phq9" | "gad7"
 *   answers         9 or 7 numbers, each 0 to 3
 *   answeredBy      name of the person who answered
 *   t               the translator (gives the display name of the severity)
 *   recommendation  optional: the text to keep (default: recommendationFor)
 *   answeredAt      optional Date (default: now)
 *   extra           anything else to keep, for example the text of the questions
 */
export function buildQuestionnaire({ kind, answers, answeredBy, t, recommendation, answeredAt = new Date(), extra = {} }) {
  const spec = QUESTIONNAIRES[kind];
  if (!spec) throw new Error(`Unknown questionnaire: ${kind}`);
  if (answers.length !== spec.items) throw new Error(`${kind} has ${spec.items} answers and ${answers.length} came`);
  if (answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) throw new Error("Every answer must be 0, 1, 2 or 3");
  if (!answeredBy?.trim()) throw new Error("Who answered is required");
  const score = scoreOf(answers);
  return {
    questionnaire: kind,
    answered_by: answeredBy.trim(),
    answered_at: answeredAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    answers,
    score,
    severity: t.questionnaireSeverity(severityOf(kind, score)),
    recommendation: recommendation ?? recommendationFor(kind, answers),
    ...extra,
  };
}
