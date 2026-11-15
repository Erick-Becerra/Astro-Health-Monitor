import { useEffect, useState } from "react";

// Today as YYYY-MM-DD in the local time zone.
const todayLocal = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (d) => d.toLocaleDateString("en-GB");

/**
 * Date range + "Generate report". Messages show in the page (never a browser alert).
 * Dates are whole days: 00:00:00 of the start day to 23:59:59 of the end day.
 * `firstSeen` (ISO) is when the astronaut's data begins: no data before it.
 *
 *   <ReportBar astronautId={id} astronautName={name} firstSeen={iso} onGenerate={({ astronautId, start, end, since, until }) => ...} />
 */
export default function ReportBar({ astronautId, astronautName, firstSeen, onGenerate }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notice, setNotice] = useState(null); // { kind: "error" | "warn" | "ok", text }

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const fail = (text) => setNotice({ kind: "error", text });

  const generate = () => {
    if (!astronautId) return fail("Select an astronaut first.");
    if (!start || !end) return fail("Choose a start date and an end date.");
    if (end < start) return fail("The end date must be on or after the start date.");
    if (end > todayLocal()) return fail("The end date cannot be in the future.");
    const since = new Date(`${start}T00:00:00`);
    const until = new Date(`${end}T23:59:59`);
    const first = firstSeen ? new Date(firstSeen) : null;
    if (first && until < first) {
      return fail(`${astronautName ?? astronautId} has no data before ${fmtDate(first)}. Pick a later range.`);
    }
    if (first && since < first) {
      setNotice({ kind: "warn", text: `Data for ${astronautName ?? astronautId} starts on ${fmtDate(first)}. The report will start there.` });
    } else {
      setNotice({ kind: "ok", text: "Opening the report in a new tab…" });
    }
    return onGenerate?.({ astronautId, start, end, since: since.toISOString(), until: until.toISOString() });
  };

  return (
    <div className="report-bar">
      <label>
        <span>Start date</span>
        <input type="date" value={start} max={todayLocal()} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        <span>End date</span>
        <input type="date" value={end} max={todayLocal()} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <button type="button" onClick={generate}>Generate report</button>
      {notice && (
        <p className="notice" data-kind={notice.kind} role="alert">
          {notice.text}
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
        </p>
      )}
    </div>
  );
}
