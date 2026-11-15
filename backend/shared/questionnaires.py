"""Saved questionnaires (PHQ-9 and GAD-7).

The FRONT builds the questions and works out the score, the severity and the recommendation. The backend
keeps what the front sends, whole, as long text, and makes it available to read later. It only checks that the
JSON is coherent (the right number of answers, each 0 to 3, and a score that is the sum of the answers), so a
bug of the screen does not end up as a wrong clinical record.

The JSON the front sends (everything else it adds, such as the text of the questions, is kept as it is):

    {"questionnaire": "phq9" | "gad7",
     "answered_by": "Sofía Navarro",          name of the person who answered
     "answers": [2, 2, 1, 2, 1, 2, 1, 0, 1],  9 answers for the PHQ-9, 7 for the GAD-7, each 0 to 3
     "score": 12,                              the sum of the answers
     "severity": "Moderada",                   as the front writes it
     "recommendation": "...",                  as the front writes it
     "answered_at": "2026-11-14T08:15:00Z"}    optional: when it was answered (default: now)
"""
import json
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

ITEMS = {"phq9": 9, "gad7": 7}  # scored questions of each questionnaire
MAX_BYTES = 200_000  # the largest JSON that is kept (about 200 KB)


async def raw_json(request: Request) -> dict:
    """The body exactly as it arrived, to keep it whole (the model below only checks it)."""
    try:
        data = await request.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


class QuestionnaireIn(BaseModel):
    model_config = ConfigDict(extra="allow")  # whatever else the front sends is kept

    questionnaire: Literal["phq9", "gad7"]
    answered_by: str = Field(min_length=1, max_length=120)
    answers: list[int]
    score: int = Field(ge=0)
    severity: str = Field(min_length=1, max_length=80)
    recommendation: str = Field(min_length=1, max_length=4000)
    answered_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _coherent(self):
        expected = ITEMS[self.questionnaire]
        if len(self.answers) != expected:
            raise ValueError(f"{self.questionnaire} has {expected} answers and {len(self.answers)} came")
        if any(not 0 <= a <= 3 for a in self.answers):
            raise ValueError("every answer must be between 0 and 3")
        if self.score != sum(self.answers):
            raise ValueError(f"score {self.score} is not the sum of the answers ({sum(self.answers)})")
        return self


def as_utc(moment: Optional[datetime]) -> datetime:
    """A time with zone in UTC (no zone is read as UTC, no time is now)."""
    if moment is None:
        return datetime.now(timezone.utc)
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


def record_view(row) -> dict:
    """A saved row for the API: the columns, and `response` = the JSON the front sent, as an object."""
    out = {k: v for k, v in dict(row).items() if k != "content"}
    out["response"] = json.loads(row["content"])
    return out
