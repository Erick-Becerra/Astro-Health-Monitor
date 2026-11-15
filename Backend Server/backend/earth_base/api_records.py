"""Record files (CSV) of the astronauts, uploaded from Earth.

The file is stored whole, exactly as uploaded, plus its header and row count so the app can list it without
opening it. Each upload is a new version (nothing is overwritten). The record stays on Earth: it is never
sent to the station. Who uploaded it goes to the change log (never the contents).
"""
import csv
import io
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from shared.audit import log_change, who
from shared.database import get_db

router = APIRouter(prefix="/api", tags=["astronaut record"])
earth_who = who("earth-app")
MAX_BYTES = 2 * 1024 * 1024
META = "id, astronaut_id, filename, size_bytes, delimiter, columns, row_count, note, uploaded_by, uploaded_at"


def _decode(raw: bytes) -> str:
    if b"\x00" in raw:
        raise HTTPException(status_code=422, detail="This is not a text CSV file (it has binary content)")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=422, detail="The file is not UTF-8 or Windows-1252 text")


def _parse(content: str) -> tuple[str, list[list[str]]]:
    try:
        delimiter = csv.Sniffer().sniff(content[:4096], delimiters=",;\t|").delimiter
    except csv.Error:
        delimiter = ","
    rows = [r for r in csv.reader(io.StringIO(content), delimiter=delimiter) if any(c.strip() for c in r)]
    if not rows or not any(c.strip() for c in rows[0]):
        raise HTTPException(status_code=422, detail="The CSV is empty or has no header row")
    return delimiter, rows


def _require_astronaut(db: Session, astronaut_id: str) -> None:
    found = db.execute(text("SELECT 1 FROM earth.astronauts WHERE astronaut_id = :id"), {"id": astronaut_id}).first()
    if found is None:
        raise HTTPException(status_code=404, detail="Astronaut not found")


def _find(db: Session, astronaut_id: str, file_id: str, columns: str = META):
    if file_id == "latest":
        row = db.execute(text(f"SELECT {columns} FROM earth.astronaut_records WHERE astronaut_id = :a "
                              "ORDER BY uploaded_at DESC, id DESC LIMIT 1"), {"a": astronaut_id}).mappings().first()
    elif file_id.isdigit():
        row = db.execute(text(f"SELECT {columns} FROM earth.astronaut_records WHERE id = :i AND astronaut_id = :a"),
                         {"i": int(file_id), "a": astronaut_id}).mappings().first()
    else:
        row = None
    if row is None:
        raise HTTPException(status_code=404, detail="Record file not found")
    return row


@router.post("/astronauts/{astronaut_id}/records", status_code=201)
async def upload_record(astronaut_id: str, request: Request, filename: Optional[str] = None, note: Optional[str] = None,
                        db: Session = Depends(get_db), actor: dict = Depends(earth_who)):
    """Upload the record of an astronaut as a CSV. Two ways:
      - form (multipart/form-data): field `file` (the .csv) and optional `note`.
      - raw: the CSV as the body (Content-Type: text/csv) with `?filename=expediente.csv`.
    Answers 201 with the file's data (id, filename, columns, row_count...). Each upload is a new version."""
    _require_astronaut(db, astronaut_id)
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(status_code=422, detail="Send the file in the form field 'file'")
        raw, name = await upload.read(), (upload.filename or filename or "")
        note = form.get("note") or note
    else:
        raw, name = await request.body(), (filename or "")
    if not name.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="The file must be a .csv (with a raw body send ?filename=expediente.csv)")
    if not raw:
        raise HTTPException(status_code=422, detail="The file is empty")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"The file is larger than {MAX_BYTES // (1024 * 1024)} MB")
    delimiter, rows = _parse(_decode(raw))
    name = name.replace("\\", "/").split("/")[-1][:120]
    row = db.execute(text(f"""
        INSERT INTO earth.astronaut_records (astronaut_id, filename, size_bytes, delimiter, columns, row_count, content,
                                             note, uploaded_by)
        VALUES (:a, :f, :s, :d, CAST(:c AS jsonb), :n, :raw, :note, :by) RETURNING {META}
    """), {"a": astronaut_id, "f": name, "s": len(raw), "d": delimiter, "c": json.dumps(rows[0]),
           "n": len(rows) - 1, "raw": raw, "note": (str(note)[:500] if note else None), "by": actor["actor"]}).mappings().one()
    log_change(db, origin="earth", astronaut_id=astronaut_id, variable="record_file", old=None,
               new={"filename": name, "rows": len(rows) - 1, "size_bytes": len(raw)}, who=actor)
    db.commit()
    return dict(row)


@router.get("/astronauts/{astronaut_id}/records")
def list_records(astronaut_id: str, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    """The record files of an astronaut, newest first (without their contents). Empty list if there is none.
    The first one is the current record."""
    _require_astronaut(db, astronaut_id)
    rows = db.execute(text(f"SELECT {META} FROM earth.astronaut_records WHERE astronaut_id = :a "
                           "ORDER BY uploaded_at DESC, id DESC LIMIT :n"), {"a": astronaut_id, "n": limit}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/astronauts/{astronaut_id}/records/{file_id}")
def get_record(astronaut_id: str, file_id: str, db: Session = Depends(get_db)):
    """Data of one record file (`file_id` is its id, or `latest`). Does not include the contents."""
    _require_astronaut(db, astronaut_id)
    return dict(_find(db, astronaut_id, file_id))


@router.get("/astronauts/{astronaut_id}/records/{file_id}/rows")
def record_rows(astronaut_id: str, file_id: str, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000),
                db: Session = Depends(get_db)):
    """The CSV as JSON to show it in a table: `columns`, `rows` (lists of text) and `total`. Use offset and limit to page."""
    _require_astronaut(db, astronaut_id)
    row = _find(db, astronaut_id, file_id, META + ", content")
    _, rows = _parse(_decode(bytes(row["content"])))
    return {"id": row["id"], "filename": row["filename"], "columns": rows[0], "total": len(rows) - 1,
            "offset": offset, "rows": rows[1:][offset:offset + limit]}


@router.get("/astronauts/{astronaut_id}/records/{file_id}/download")
def download_record(astronaut_id: str, file_id: str, db: Session = Depends(get_db)):
    """The file exactly as it was uploaded (`file_id` is its id, or `latest`)."""
    _require_astronaut(db, astronaut_id)
    row = _find(db, astronaut_id, file_id, META + ", content")
    safe = row["filename"].replace('"', "")
    return Response(content=bytes(row["content"]), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{safe}"'})
