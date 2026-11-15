// Spanish version of the two questionnaires. It only holds the texts: scoring, bands and levels stay in
// questionnaires.js, so both languages score exactly the same.
// The wording follows the usual Spanish versions of the PHQ-9 and GAD-7. The treatment sentences and the safety
// message are DRAFT translations: they must be validated by the clinical team before real use.

export const OPTIONS_ES = ["Nunca", "Varios días", "Más de la mitad de los días", "Casi todos los días"];

const INTRO = "Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?";

export const ES = {
  phq9: {
    title: "Depresión (PHQ-9)",
    description: "El Cuestionario de Salud del Paciente-9 sirve para detectar, vigilar y medir la gravedad de la depresión.",
    intro: INTRO,
    questions: [
      "Poco interés o placer en hacer las cosas",
      "Se ha sentido decaído(a), deprimido(a) o sin esperanzas",
      "Dificultad para quedarse dormido(a), para seguir dormido(a) o dormir demasiado",
      "Se ha sentido cansado(a) o con poca energía",
      "Con poco apetito o ha comido en exceso",
      "Se ha sentido mal consigo mismo(a), o que es un fracaso, o que ha quedado mal con usted mismo(a) o con su familia",
      "Dificultad para concentrarse en cosas como leer el periódico o ver la televisión",
      "Se ha movido o hablado tan lento que otras personas podrían haberlo notado. O, al contrario, ha estado tan inquieto(a) o agitado(a) que se ha movido mucho más de lo normal",
      "Pensamientos de que estaría mejor muerto(a) o de hacerse daño de alguna manera",
    ],
    severities: {
      none_minimal: ["Nula o mínima", "Ninguno"],
      mild: ["Leve", "Observación atenta; repetir el PHQ-9 en el seguimiento"],
      moderate: ["Moderada", "Plan de tratamiento, considerando orientación psicológica, seguimiento y/o farmacoterapia"],
      moderately_severe: ["Moderadamente grave", "Tratamiento activo con farmacoterapia y/o psicoterapia"],
      severe: [
        "Grave",
        "Inicio inmediato de farmacoterapia y, si hay deterioro grave o mala respuesta al tratamiento, derivación urgente a un especialista en salud mental para psicoterapia y/o manejo colaborativo",
      ],
    },
  },
  gad7: {
    title: "Ansiedad (GAD-7)",
    description: "La escala de Trastorno de Ansiedad Generalizada de 7 ítems es una herramienta de detección inicial de este trastorno.",
    intro: INTRO,
    questions: [
      "Sentirse nervioso(a), ansioso(a) o con los nervios de punta",
      "No poder dejar de preocuparse o no poder controlar la preocupación",
      "Preocuparse demasiado por diferentes cosas",
      "Dificultad para relajarse",
      "Estar tan inquieto(a) que es difícil permanecer sentado(a) tranquilamente",
      "Molestarse o ponerse irritable con facilidad",
      "Sentir miedo, como si algo terrible pudiera pasar",
    ],
    cutPoint:
      "Un puntaje de 8 o más es un punto de corte razonable para un probable trastorno de ansiedad generalizada: se justifica una evaluación diagnóstica más a fondo.",
    severities: {
      minimal: ["Ansiedad mínima", "Ninguno"],
      mild: ["Ansiedad leve", "Observación atenta; repetir el GAD-7 en el seguimiento"],
      moderate: ["Ansiedad moderada", "Hablar con el equipo de salud conductual; se aconseja una evaluación más a fondo y un plan de seguimiento"],
      severe: ["Ansiedad grave", "Contactar al equipo de salud conductual para una evaluación pronta y un plan de tratamiento"],
    },
  },
};

export const SAFETY_MESSAGE_ES =
  "La pregunta 9 se respondió con un valor mayor que cero. Esto requiere una evaluación del riesgo de suicidio por parte de alguien competente. Contacte ahora mismo al médico de vuelo o al apoyo de salud conductual y no se quede solo(a).";
