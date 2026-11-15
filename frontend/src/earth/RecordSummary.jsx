const age = (iso) => {
  if (!iso) return null;
  const b = new Date(iso);
  const n = new Date();
  const years = n.getFullYear() - b.getFullYear();
  return n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? years - 1 : years;
};
const dash = (v, unit = "") => (v === null || v === undefined || v === "" ? "—" : `${v}${unit}`);

/**
 * Short record card shown under the selected astronaut in the list. The full record lives in <RecordPanel>.
 *
 *   <RecordSummary profile={profile} records={records} t={t} onOpenRecord={...} onEdit={...} />
 */
export default function RecordSummary({ profile, records, t, onOpenRecord, onEdit }) {
  const p = profile ?? {};
  const empty = !Object.values(p).some((v) => v !== null && v !== undefined && v !== "");
  const latest = records?.[0];
  return (
    <div className="record-summary">
      {empty ? <p className="muted">No profile data yet.</p> : (
        <>
          <p>{dash(p.agency)} · {dash(age(p.birth_date), " y")} · {p.gender ? t.gender(p.gender) : "—"} · {dash(p.weight_kg, " kg")}</p>
          <p>Baseline: HR {dash(p.baseline_hr)} bpm · BP {dash(p.baseline_bp_systolic)}/{dash(p.baseline_bp_diastolic)} mmHg</p>
          <p>Prior radiation: {dash(p.prior_radiation_msv, " mSv")}</p>
        </>
      )}
      <p className={latest ? "" : "muted"}>
        {latest ? `Record #${latest.id} · ${new Date(latest.uploaded_at).toLocaleDateString("en-GB")}` : "No record file yet"}
      </p>
      <div className="record-actions">
        <button type="button" onClick={onOpenRecord}>{latest ? "Full record" : "Upload record"}</button>
        <button type="button" onClick={onEdit}>Edit profile</button>
      </div>
    </div>
  );
}
