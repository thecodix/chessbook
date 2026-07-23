import math
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class LineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id:            int
    position:      int
    label:         str
    moves:         list[str]
    idea:          Optional[str]
    retention:     float
    interval_days: int
    repetitions:   int
    next_review:   Optional[date]


class OpeningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id:          str
    name:        str
    color:       str
    description: Optional[str]
    lines:       list[LineOut]


class DueLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id:           int
    label:        str
    opening_id:   str
    opening_name: str
    next_review:  Optional[date]
    interval_days: int


class ReviewRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    line_id: int
    quality: int   # 0–5  (Again=1, Hard=3, Good=4, Easy=5)


class ReviewResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    next_review:   str
    interval_days: int
    retention:     float


# ── SM-2 ──────────────────────────────────────────────────────────────────────

def _sm2(line: models.Line, quality: int) -> models.Line:
    q = max(0, min(5, quality))
    if q >= 3:
        if line.repetitions == 0:
            line.interval_days = 1
        elif line.repetitions == 1:
            line.interval_days = 6
        else:
            line.interval_days = math.ceil(line.interval_days * line.ease_factor)
        line.repetitions += 1
    else:
        line.repetitions = 0
        line.interval_days = 1

    line.ease_factor  = max(1.3, line.ease_factor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    line.next_review  = date.today() + timedelta(days=line.interval_days)
    line.retention    = min(100.0, max(0.0, line.retention + (q - 2) * 8))
    return line


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[OpeningOut])
def list_openings(db: Session = Depends(get_db)):
    return db.query(models.Opening).order_by(models.Opening.id).all()


@router.get("/due", response_model=list[DueLineOut])
def due_lines(db: Session = Depends(get_db)):
    today = date.today()
    rows = (
        db.query(models.Line, models.Opening.name)
        .join(models.Opening)
        .filter(models.Line.next_review <= today)
        .order_by(models.Line.next_review)
        .all()
    )
    results = []
    for line, opening_name in rows:
        results.append(DueLineOut(
            id=line.id,
            label=line.label,
            opening_id=line.opening_id,
            opening_name=opening_name,
            next_review=line.next_review,
            interval_days=line.interval_days,
        ))
    return results


@router.get("/{opening_id}", response_model=OpeningOut)
def get_opening(opening_id: str, db: Session = Depends(get_db)):
    o = db.query(models.Opening).filter_by(id=opening_id).first()
    if not o:
        raise HTTPException(404, "Opening not found")
    return o


@router.post("/{opening_id}/review", response_model=ReviewResult)
def submit_review(opening_id: str, body: ReviewRequest, db: Session = Depends(get_db)):
    line = db.query(models.Line).filter_by(id=body.line_id, opening_id=opening_id).first()
    if not line:
        raise HTTPException(404, "Line not found")
    _sm2(line, body.quality)
    db.commit()
    db.refresh(line)
    return ReviewResult(
        next_review=line.next_review.isoformat(),
        interval_days=line.interval_days,
        retention=line.retention,
    )
