// Data for the trend charts (Recharts, already in the project). Pure functions.
//
//   const readings = await earth.readings(id, { since, bucketSeconds: 300, limit: 5000 });
//   const data = toChartData(readings, ["heart_rate", "body_temperature"]);
//   <LineChart data={data}><XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} scale="time" />
//     <Line dataKey="heart_rate" connectNulls={false} /> ...
//
// A sensor that lost its signal sends no value (null): with connectNulls={false} the line has a gap, which is the
// honest picture. Do not fill the gap with the last value.

/** Readings to Recharts rows: `time` in milliseconds and the chosen variables (null stays null). */
export function toChartData(readings, keys) {
  return readings.map((r) => ({
    time: new Date(r.timestamp).getTime(),
    level: r.level ?? null,
    ...Object.fromEntries(keys.map((k) => [k, r[k] ?? null])),
  }));
}

/**
 * Periods where a sensor group had no signal, to shade them in the chart (<ReferenceArea x1={from} x2={to} />).
 * Needs the readings WITHOUT bucketSeconds: the grouped ones have no per-sensor information.
 * group: cardiovascular | respiratory | thermoregulation | daily_assessment | radiation_dosimetry
 */
export function lostRanges(readings, group = "cardiovascular") {
  const ranges = [];
  let open = null;
  for (const r of readings) {
    const lost = r.meta?.signal_quality?.[group] === "lost";
    const time = new Date(r.timestamp).getTime();
    if (lost && open === null) open = { from: time, to: time };
    else if (lost) open.to = time;
    else if (open !== null) { ranges.push(open); open = null; }
  }
  if (open !== null) ranges.push(open);
  return ranges;
}

/**
 * Colour bands for the background of a chart, from GET /level-history (which comes newest first):
 * [{ from, to, level }] where each band lasts until the next change (the last one until `now`).
 */
export function levelBands(history, now = Date.now()) {
  const asc = [...history].sort((a, b) => new Date(a.at) - new Date(b.at));
  return asc.map((h, i) => ({
    from: new Date(h.at).getTime(),
    to: i + 1 < asc.length ? new Date(asc[i + 1].at).getTime() : now,
    level: h.level,
    reasons: h.reasons,
  }));
}
