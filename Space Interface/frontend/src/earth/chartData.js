export function toChartData(readings, keys) {
  return readings.map((r) => ({
    time: new Date(r.timestamp).getTime(),
    level: r.level ?? null,
    ...Object.fromEntries(keys.map((k) => [k, r[k] ?? null])),
  }));
}

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

export function levelBands(history, now = Date.now()) {
  const asc = [...history].sort((a, b) => new Date(a.at) - new Date(b.at));
  return asc.map((h, i) => ({
    from: new Date(h.at).getTime(),
    to: i + 1 < asc.length ? new Date(asc[i + 1].at).getTime() : now,
    level: h.level,
    reasons: h.reasons,
  }));
}
