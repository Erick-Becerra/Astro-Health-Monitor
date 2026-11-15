// The two wellbeing questionnaires. Questions, answers, scoring and the proposed
// treatment for each result live here, in the front. When the astronaut finishes
// one, the whole result is sent to the station as one JSON (see buildPayload) and
// read back the same way (see parseResponse).
//
// Texts are the ones supplied by the team for the PHQ-9 (depression) and the
// GAD-7 (anxiety).

export const OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

const INTRO = "Over the last 2 weeks, how often have you been bothered by the following problems?";

export const QUESTIONNAIRES = {
  phq9: {
    id: "phq9",
    version: "PHQ-9",
    short: "PHQ-9",
    title: "Depression (PHQ-9)",
    description:
      "The Patient Health Questionnaire-9 is used to screen, monitor and measure the severity of depression.",
    topic: "depression",
    intro: INTRO,
    max: 27,
    // Question 9 asks about suicide risk: any answer above zero needs further assessment.
    safetyItem: 9,
    questions: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed or hopeless",
      "Trouble falling asleep, staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself - or that you're a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed. Or, the opposite - being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way",
    ],
    severities: [
      { upTo: 4, key: "none_minimal", level: "green", label: "None-minimal", treatment: "None" },
      { upTo: 9, key: "mild", level: "yellow", label: "Mild", treatment: "Watchful waiting; repeat PHQ-9 at follow-up" },
      {
        upTo: 14,
        key: "moderate",
        level: "orange",
        label: "Moderate",
        treatment: "Treatment plan, considering counseling, follow-up and/or pharmacotherapy",
      },
      {
        upTo: 19,
        key: "moderately_severe",
        level: "red",
        label: "Moderately Severe",
        treatment: "Active treatment with pharmacotherapy and/or psychotherapy",
      },
      {
        upTo: 27,
        key: "severe",
        level: "red",
        label: "Severe",
        treatment:
          "Immediate initiation of pharmacotherapy and, if severe impairment or poor response to therapy, expedited referral to a mental health specialist for psychotherapy and/or collaborative management",
      },
    ],
  },
  gad7: {
    id: "gad7",
    version: "GAD-7",
    short: "GAD-7",
    title: "Anxiety (GAD-7)",
    description:
      "The Generalized Anxiety Disorder 7-item scale is an initial screening tool for generalized anxiety disorder.",
    topic: "anxiety",
    intro: INTRO,
    max: 21,
    safetyItem: null,
    questions: [
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen",
    ],
    // A score of 8 or more is the usual cut-point for probable generalized anxiety disorder.
    cutPoint: {
      score: 8,
      text: "A score of 8 or greater is a reasonable cut-point for probable generalized anxiety disorder: further diagnostic assessment is warranted.",
    },
    severities: [
      { upTo: 4, key: "minimal", level: "green", label: "Minimal Anxiety", treatment: "None" },
      { upTo: 9, key: "mild", level: "yellow", label: "Mild Anxiety", treatment: "Watchful waiting; repeat GAD-7 at follow-up" },
      {
        upTo: 14,
        key: "moderate",
        level: "orange",
        label: "Moderate Anxiety",
        treatment: "Talk to the behavioral health team; further assessment and a follow-up plan are advised",
      },
      {
        upTo: 21,
        key: "severe",
        level: "red",
        label: "Severe Anxiety",
        treatment: "Contact the behavioral health team for a prompt assessment and a treatment plan",
      },
    ],
  },
};

export const SAFETY_MESSAGE =
  "Question 9 was answered above zero. This needs further assessment for suicide risk by someone competent to assess it. Contact the flight surgeon or behavioral health support right now and do not stay alone.";

export const REMINDER_HOURS = 24;

export const total = (answers) => answers.reduce((sum, value) => sum + value, 0);

export const severityFor = (definition, score) =>
  definition.severities.find((s) => score <= s.upTo) ?? definition.severities.at(-1);

// The proposed treatment for a score (the band's text, plus the cut-point note
// when the questionnaire has one and the score reaches it).
export function treatmentFor(definition, score) {
  const band = severityFor(definition, score);
  if (definition.cutPoint && score >= definition.cutPoint.score) return `${band.treatment}. ${definition.cutPoint.text}`;
  return band.treatment;
}

// The whole result, as the JSON sent to the station. The first seven fields are
// the ones the station requires; the rest travels along and is stored as sent.
export function buildPayload({ definition, answers, astronautId, answeredBy, answeredAt = new Date() }) {
  const score = total(answers);
  const severity = severityFor(definition, score);
  const safety = definition.safetyItem ? answers[definition.safetyItem - 1] > 0 : false;
  const treatment = treatmentFor(definition, score);
  return {
    questionnaire: definition.id,
    answered_by: answeredBy,
    answered_at: answeredAt.toISOString(),
    answers,
    score,
    severity: severity.label,
    recommendation: safety ? `${SAFETY_MESSAGE} ${treatment}` : treatment,
    // Extra detail kept with the result
    schema_version: 1,
    version: definition.version,
    language: "en",
    title: definition.title,
    astronaut_id: astronautId,
    severity_key: severity.key,
    max_score: definition.max,
    average: Number((score / answers.length).toFixed(2)),
    item9_alert: safety,
    items: definition.questions.map((question, index) => ({
      n: index + 1,
      question,
      answer: answers[index],
      answer_label: OPTIONS[answers[index]].label,
    })),
  };
}

// Reads one stored result (a row of GET /questionnaires) into what the screen
// shows. The `response` field is the JSON the front sent; it may arrive as an
// object or as text, and older entries may have fewer fields, so every field
// falls back to something sensible.
export function parseResponse(row) {
  let response = row.response;
  if (typeof response === "string") {
    try {
      response = JSON.parse(response);
    } catch {
      response = {};
    }
  }
  response = response && typeof response === "object" ? response : {};

  const definition = QUESTIONNAIRES[response.questionnaire ?? row.questionnaire] ?? null;
  const answers = Array.isArray(response.answers) ? response.answers : [];
  const score = Number(response.score ?? row.score ?? total(answers));
  const found = definition ? severityFor(definition, score) : null;

  const items = (Array.isArray(response.items) && response.items.length
    ? response.items
    : answers.map((answer, index) => ({ n: index + 1, answer }))
  ).map((item, index) => {
    const n = item.n ?? index + 1;
    const answer = Number(item.answer);
    return {
      n,
      question: item.question ?? definition?.questions[n - 1] ?? `Question ${n}`,
      answer,
      label: item.answer_label ?? OPTIONS[answer]?.label ?? String(item.answer),
    };
  });

  const max = response.max_score ?? definition?.max ?? null;
  const safetyItem = definition?.safetyItem;
  return {
    id: row.id ?? null,
    questionnaire: response.questionnaire ?? row.questionnaire,
    title: response.title ?? definition?.title ?? String(row.questionnaire).toUpperCase(),
    answeredBy: response.answered_by ?? row.answered_by,
    answeredAt: response.answered_at ?? row.answered_at,
    score,
    max,
    average: response.average ?? (items.length ? Number((score / items.length).toFixed(2)) : null),
    severity: response.severity ?? row.severity ?? found?.label ?? "",
    level: found?.level ?? null,
    recommendation: response.recommendation ?? (definition ? treatmentFor(definition, score) : ""),
    item9Alert:
      response.item9_alert ?? (safetyItem ? Number(answers[safetyItem - 1] ?? items[safetyItem - 1]?.answer) > 0 : false),
    items,
  };
}

// When the next reminder is due for one questionnaire, from its latest result.
export function reminder(latest, now = Date.now()) {
  const when = latest ? Date.parse(latest.answered_at ?? latest.uplinked_at) : NaN;
  if (Number.isNaN(when)) return { due: true, hoursLeft: 0 };
  const hoursLeft = REMINDER_HOURS - (now - when) / 3600000;
  return { due: hoursLeft <= 0, hoursLeft: Math.max(0, hoursLeft) };
}
