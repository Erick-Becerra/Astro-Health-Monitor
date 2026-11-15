import { useCallback, useEffect, useState } from "react";
import { describeError } from "../shared/request.js";
import { earth } from "./earthApi.js";
import { downloadCsv, recordTemplateCsv } from "./recordCsv.js";

const PAGE = 100;
const fmt = (iso) => new Date(iso).toLocaleString("en-GB");
const cell = (row, columns, i) => (Array.isArray(row) ? row[i] : row[columns[i]]);

function uploadMessage(err) {
  if (err.status === 413) return "The file is larger than 2 MB.";
  if (err.status === 422) return `The file was rejected: ${err.message}`;
  return describeError(err);
}

/**
 * The record (CSV) of one astronaut: versions, the table, download, and upload of a new version.
 *
 *   <RecordPanel id={id} name={name} actor={actor} onClose={...} onChanged={() => ...} />
 */
export default function RecordPanel({ id, name, actor, onClose, onChanged }) {
  const [versions, setVersions] = useState(null);
  const [fileId, setFileId] = useState("latest");
  const [table, setTable] = useState(null);
  const [offset, setOffset] = useState(0);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    earth.records(id).then((v) => alive && setVersions(v)).catch((e) => alive && (setVersions([]), setError(describeError(e))));
    return () => { alive = false; };
  }, [id, reload]);

  useEffect(() => {
    if (!versions?.length) { setTable(null); return undefined; }
    let alive = true;
    earth.recordRows(id, fileId, { offset, limit: PAGE })
      .then((t) => alive && setTable(t))
      .catch((e) => alive && setError(describeError(e)));
    return () => { alive = false; };
  }, [id, fileId, offset, versions]);

  const upload = useCallback(async () => {
    if (!file) return setError("Choose a CSV file first.");
    setBusy(true);
    setError(null);
    try {
      await earth.uploadRecord(id, file, actor, note);
      setFile(null); setNote(""); setFileId("latest"); setOffset(0); setReload((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setError(uploadMessage(err));
    }
    return setBusy(false);
  }, [id, file, note, actor, onChanged]);

  const downloadTemplate = () => downloadCsv("astronaut-record-template.csv", recordTemplateCsv());

  const current = versions?.find((v) => String(v.id) === String(fileId)) ?? versions?.[0];
  const total = table?.total ?? 0;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Astronaut record">
      <div className="modal-card wide">
        <header className="modal-head">
          <h2>Record · {name ?? id}</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {versions === null && <p className="muted">Loading…</p>}
          {versions?.length === 0 && <p className="muted">This astronaut has no record file yet. Upload a CSV below.</p>}
          {versions?.length > 0 && (
            <>
              <div className="record-bar">
                <label>Version
                  <select value={fileId} onChange={(e) => { setFileId(e.target.value); setOffset(0); }}>
                    {versions.map((v, i) => (
                      <option key={v.id} value={i === 0 ? "latest" : v.id}>
                        #{v.id}{i === 0 ? " (current)" : ""} · {v.filename} · {fmt(v.uploaded_at)} · {v.uploaded_by}
                      </option>
                    ))}
                  </select>
                </label>
                <a href={earth.recordUrl(id, fileId)} target="_blank" rel="noreferrer">Download original</a>
              </div>
              {current && <p className="muted">{current.row_count} rows · {current.columns?.length} columns · {Math.round(current.size_bytes / 1024 * 10) / 10} KB</p>}
              {table && (
                <div className="table-wrap">
                  <table>
                    <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={offset + r}>{table.columns.map((c, i) => <td key={c}>{String(cell(row, table.columns, i) ?? "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {total > PAGE && (
                <div className="record-bar">
                  <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
                  <span className="muted">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
                  <button type="button" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</button>
                </div>
              )}
            </>
          )}
          <fieldset>
            <legend>Upload a new version</legend>
            <div className="record-bar">
              <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="primary" onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
            </div>
            <p className="muted">CSV, up to 2 MB. Nothing is overwritten: every upload becomes a new version.{" "}
              <button type="button" className="link" onClick={downloadTemplate}>Download empty template</button>
            </p>
          </fieldset>
          {error && <p className="notice" data-kind="error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
