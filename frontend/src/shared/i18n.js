export function makeTranslator(dict) {
  const entry = (group, key) => dict[group]?.[key];
  const text = (group, key, field = "label") => {
    const e = entry(group, key);
    if (e === undefined || e === null) return String(key);
    return typeof e === "string" ? e : (e[field] ?? String(key));
  };
  const levelKey = (level) => (dict.levels[level] ? level : "unknown");
  return {
    dict,
    level: (l) => text("levels", levelKey(l)),
    badge: (l) => text("levels", levelKey(l), "badge"),
    levelColor: (l) => dict.levels[levelKey(l)].color,
    levelOrder: (l) => dict.levels[levelKey(l)].order,
    banner: (l) => dict.banners[levelKey(l)],
    status: (s) => text("status", s ?? "unknown"),
    protocol: (l) => dict.protocols[l] ?? "",
    crewState: (s) => text("crewStates", s),
    system: (k, field = "label") => text("systems", k, field),
    hazard: (h) => dict.hazards[h] ?? h,
    indicator: (k) => text("indicators", k),
    unit: (k) => entry("indicators", k)?.unit ?? "",
    sensorGroup: (g) => text("sensorGroups", g),
    signalQuality: (q) => text("signalQuality", q),
    source: (s) => text("sources", s),
    manualKind: (k) => text("manualKinds", k),
    questionnaireSeverity: (s) => text("questionnaireSeverity", s),
    countermeasure: (c) => text("countermeasures", c),
    glucoseContext: (c) => text("glucoseContext", c),
    severity: (s) => text("severities", s),
    messageKind: (k) => text("messageKinds", k),
    gender: (g) => text("gender", g),
    agency: (a) => text("agencies", a),
    scenario: (s) => text("scenarios", s),
    card: (c) => text("cards", c),

    ui: (k, vars) => {
      const text = dict.ui[k] ?? k;
      return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : text;
    },
    levelWord: (l) => dict.levelWords?.[l] ?? "–",
    bodyLabel: (id) => dict.bodyLabels?.[id] ?? id.toUpperCase(),
    symptom: (k) => dict.symptoms?.[k] ?? k,
    bodyArea: (k) => dict.bodyAreas?.[k] ?? k,
    symptomSeverity: (k) => dict.symptomSeverity?.[k] ?? k,
  };
}
