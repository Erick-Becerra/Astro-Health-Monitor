"""The change log: who changed which variable, when, from what to what.

It writes to the table `change_log` of the calling service (the database role
of each service only sees its own schema, so the same code works on both).
"""
import json
from datetime import datetime
from typing import Any, Optional

from fastapi import Header
from sqlalchemy import text
from sqlalchemy.orm import Session

from .variables import BY_KEY


def who(default_app: str):
    """FastAPI dependency: who is calling, from the optional X-Actor and X-App headers."""
    def dependency(x_actor: Optional[str] = Header(None), x_app: Optional[str] = Header(None)) -> dict:
        app = (x_app or default_app)[:40]
        return {"actor": (x_actor or app)[:80], "app": app}
    return dependency


def log_change(db: Session, *, origin: str, astronaut_id: Optional[str], variable: str, old: Any, new: Any,
               who: dict, note: Optional[str] = None, at: Optional[datetime] = None) -> None:
    """Write one row, dated `at` (default: now). The caller commits."""
    db.execute(text("""
        INSERT INTO change_log (at, origin, astronaut_id, variable, old_value, new_value, actor, app, note)
        VALUES (COALESCE(CAST(:at AS timestamptz), now()), :origin, :astronaut_id, :variable,
                CAST(:old AS jsonb), CAST(:new AS jsonb), :actor, :app, :note)
    """), {"at": at, "origin": origin, "astronaut_id": astronaut_id, "variable": variable,
           "old": json.dumps(old, default=str), "new": json.dumps(new, default=str),
           "actor": who.get("actor"), "app": who.get("app"), "note": note})


def log_diff(db: Session, *, origin: str, astronaut_id: Optional[str], old: dict, new: dict, who: dict,
             note: Optional[str] = None, include_new: bool = False, at: Optional[datetime] = None) -> list[str]:
    """Log every variable in `new` whose value differs from `old`. Returns the names that changed.

    Continuous telemetry (a variable with log_delta in the catalog) is only
    logged when it moved at least that much, so sensor noise stays out. A
    variable with no previous value is not a change, unless include_new is
    True (used for profile and rules, where setting a value for the first
    time IS a change).
    """
    changed = []
    for key, value in new.items():
        if key not in old and not include_new:
            continue
        if old.get(key) == value:
            continue
        delta = (BY_KEY.get(key) or {}).get("log_delta")
        before = old.get(key)
        if delta is not None and isinstance(value, (int, float)) and isinstance(before, (int, float)) \
                and not isinstance(value, bool):
            if abs(value - before) < delta:
                continue
        log_change(db, origin=origin, astronaut_id=astronaut_id, variable=key, old=before, new=value,
                   who=who, note=note, at=at)
        changed.append(key)
    return changed
