import { useMemo, useRef } from "react";
import { worst } from "../lib/levels.js";

const hasValue = (v) => v !== null && v !== undefined;

function keepVitals(next = [], prev = []) {
  return next.map((vital) => {
    if (hasValue(vital.value) && !vital.no_signal) return vital;

    const before = prev.find((p) => p.key === vital.key);
    if (before && hasValue(before.value)) return before;

    return { ...vital, value: null, level: null, no_signal: false };
  });
}

const isSignal = (indicator) => typeof indicator === "string" && indicator.startsWith("signal_");

export const isSignalAlert = (alert) => /signal lost|no signal|sin se(ñ|n)al/i.test(alert?.summary ?? "");
const STATUS = { green: "ok", yellow: "attention", orange: "attention", red: "critical" };

export function neutralizeSignalLoss(d) {
  if (!d?.systems) return d;
  let changed = false;
  const systems = d.systems.map((system) => {
    const drivers = (system.drivers ?? []).filter((driver) => !isSignal(driver.indicator));
    if (drivers.length === (system.drivers ?? []).length) return system;
    changed = true;
    return { ...system, drivers, level: worst(...drivers.map((driver) => driver.level)) ?? "green" };
  });
  const lost = (d.data_quality ?? []).some((q) => q.quality === "lost");
  if (!changed && !lost) return d;
  const manual = Object.values(d.manual_latest ?? {}).map((m) => m?.level);
  const level = changed ? worst(...systems.map((s) => s.level), ...manual) ?? d.level : d.level;
  return {
    ...d,
    systems,
    level,
    status: changed ? (STATUS[level] ?? d.status) : d.status,
    findings: (d.findings ?? []).filter((f) => !isSignal(f.indicator)),
    guides: (d.guides ?? []).filter((g) => !isSignal(g.id)),
    data_quality: (d.data_quality ?? []).filter((q) => q.quality !== "lost"),
    signal_ignored: changed || lost,
  };
}

export function keepLastDashboard(next, prev) {
  if (!next) return next;
  if (!prev) return neutralizeSignalLoss({ ...next, vitals: keepVitals(next.vitals, []) });
  const manual = { ...(prev.manual_latest ?? {}) };
  for (const [kind, entry] of Object.entries(next.manual_latest ?? {})) if (hasValue(entry)) manual[kind] = entry;
  return neutralizeSignalLoss({
    ...next,
    level: next.level ?? prev.level,
    status: next.status ?? prev.status,
    measured_at: next.measured_at ?? prev.measured_at,
    vitals: keepVitals(next.vitals, prev.vitals),
    manual_latest: manual,
    radiation: next.radiation ?? prev.radiation,
    systems: next.systems?.length ? next.systems : prev.systems,
  });
}

export function keepLastAstronauts(next, prev) {
  if (!next || !prev) return next;
  return next.map((a) => {
    const before = prev.find((p) => p.astronaut_id === a.astronaut_id);
    if (!before) return a;
    const latest = { ...(before.latest ?? {}) };
    for (const [k, v] of Object.entries(a.latest ?? {})) if (hasValue(v)) latest[k] = v;
    return {
      ...a,
      overall_level: a.overall_level ?? before.overall_level,
      latest: Object.keys(latest).length ? latest : a.latest,
    };
  });
}

export function useLastKnown(data, merge, key = "") {
  const last = useRef(new Map());
  return useMemo(() => {
    if (!data) return last.current.get(key) ?? null;
    const merged = merge(data, last.current.get(key));
    last.current.set(key, merged);
    return merged;
  }, [data, key]);
}
