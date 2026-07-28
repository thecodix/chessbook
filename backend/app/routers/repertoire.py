import math
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth import get_current_user
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


class CatalogLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id:       int
    position: int
    label:    str
    moves:    list[str]
    idea:     Optional[str]


class CatalogOpeningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id:          str
    name:        str
    color:       str
    description: Optional[str]
    lines:       list[CatalogLineOut]


class SelectionOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    opening_ids: list[str]


class SelectionUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    opening_ids: list[str]


# ── SM-2 ──────────────────────────────────────────────────────────────────────

def _sm2(progress: models.LineProgress, quality: int) -> models.LineProgress:
    q = max(0, min(5, quality))
    if q >= 3:
        if progress.repetitions == 0:
            progress.interval_days = 1
        elif progress.repetitions == 1:
            progress.interval_days = 6
        else:
            progress.interval_days = math.ceil(progress.interval_days * progress.ease_factor)
        progress.repetitions += 1
    else:
        progress.repetitions = 0
        progress.interval_days = 1

    progress.ease_factor = max(1.3, progress.ease_factor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    progress.next_review  = date.today() + timedelta(days=progress.interval_days)
    progress.retention    = min(100.0, max(0.0, progress.retention + (q - 2) * 8))
    return progress


# ── Per-user helpers ─────────────────────────────────────────────────────────────

def _ensure_default_selection(db: Session, user: models.User) -> None:
    """First time a user touches their repertoire, default them into every
    catalog opening (matches the old global/shared behaviour) so nothing
    appears to vanish after this per-user rollout. From then on they manage
    their own selection via /selection.
    """
    has_any = db.query(models.UserOpening).filter_by(user_id=user.id).first()
    if has_any is not None:
        return
    opening_ids = [o.id for o in db.query(models.Opening.id).all()]
    for opening_id in opening_ids:
        db.add(models.UserOpening(user_id=user.id, opening_id=opening_id))
    db.commit()


def _get_or_seed_progress(db: Session, user: models.User, line: models.Line) -> models.LineProgress:
    """Fetch (or lazily create) this user's SM-2 state for a line. New rows
    are seeded from the line's legacy global SM-2 fields rather than blank
    defaults, so any practice history recorded before the per-user rollout
    isn't silently lost for the first user who touches that line.
    """
    progress = (
        db.query(models.LineProgress)
        .filter_by(user_id=user.id, line_id=line.id)
        .first()
    )
    if progress is not None:
        return progress
    progress = models.LineProgress(
        user_id=user.id, line_id=line.id,
        ease_factor=line.ease_factor or 2.5,
        interval_days=line.interval_days or 1,
        repetitions=line.repetitions or 0,
        next_review=line.next_review or date.today(),
        retention=line.retention or 0.0,
    )
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return progress


def _line_out(line: models.Line, progress: Optional[models.LineProgress]) -> LineOut:
    return LineOut(
        id=line.id, position=line.position, label=line.label,
        moves=line.moves, idea=line.idea,
        retention=progress.retention if progress else 0.0,
        interval_days=progress.interval_days if progress else 1,
        repetitions=progress.repetitions if progress else 0,
        next_review=progress.next_review if progress else date.today(),
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/catalog", response_model=list[CatalogOpeningOut])
def list_catalog(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Every opening/line in the shared catalog, regardless of selection —
    used by the opening picker UI."""
    return db.query(models.Opening).order_by(models.Opening.id).all()


@router.get("/selection", response_model=SelectionOut)
def get_selection(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _ensure_default_selection(db, user)
    rows = db.query(models.UserOpening.opening_id).filter_by(user_id=user.id).all()
    return SelectionOut(opening_ids=[r[0] for r in rows])


@router.post("/selection", response_model=SelectionOut)
def update_selection(body: SelectionUpdate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    valid_ids = {o.id for o in db.query(models.Opening.id).all()}
    wanted = {oid for oid in body.opening_ids if oid in valid_ids}

    current = {row.opening_id: row for row in db.query(models.UserOpening).filter_by(user_id=user.id).all()}

    for opening_id in wanted - current.keys():
        db.add(models.UserOpening(user_id=user.id, opening_id=opening_id))
    for opening_id, row in current.items():
        if opening_id not in wanted:
            db.delete(row)

    db.commit()
    return SelectionOut(opening_ids=sorted(wanted))


@router.get("/", response_model=list[OpeningOut])
def list_openings(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _ensure_default_selection(db, user)
    selected_ids = [r[0] for r in db.query(models.UserOpening.opening_id).filter_by(user_id=user.id).all()]
    if not selected_ids:
        return []

    openings = (
        db.query(models.Opening)
        .filter(models.Opening.id.in_(selected_ids))
        .order_by(models.Opening.id)
        .all()
    )
    line_ids = [line.id for o in openings for line in o.lines]
    progress_by_line = {
        p.line_id: p
        for p in db.query(models.LineProgress).filter(
            models.LineProgress.user_id == user.id,
            models.LineProgress.line_id.in_(line_ids),
        ).all()
    }

    results = []
    for o in openings:
        results.append(OpeningOut(
            id=o.id, name=o.name, color=o.color, description=o.description,
            lines=[_line_out(line, progress_by_line.get(line.id)) for line in o.lines],
        ))
    return results


@router.get("/due", response_model=list[DueLineOut])
def due_lines(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _ensure_default_selection(db, user)
    today = date.today()
    selected_ids = [r[0] for r in db.query(models.UserOpening.opening_id).filter_by(user_id=user.id).all()]
    if not selected_ids:
        return []

    rows = (
        db.query(models.Line, models.Opening.name)
        .join(models.Opening)
        .filter(models.Line.opening_id.in_(selected_ids))
        .all()
    )
    line_ids = [line.id for line, _ in rows]
    progress_by_line = {
        p.line_id: p
        for p in db.query(models.LineProgress).filter(
            models.LineProgress.user_id == user.id,
            models.LineProgress.line_id.in_(line_ids),
        ).all()
    }

    results = []
    for line, opening_name in rows:
        progress = progress_by_line.get(line.id)
        next_review = progress.next_review if progress else today
        if next_review > today:
            continue
        results.append(DueLineOut(
            id=line.id,
            label=line.label,
            opening_id=line.opening_id,
            opening_name=opening_name,
            next_review=next_review,
            interval_days=progress.interval_days if progress else 1,
        ))
    results.sort(key=lambda r: r.next_review or today)
    return results


@router.get("/{opening_id}", response_model=OpeningOut)
def get_opening(opening_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    o = db.query(models.Opening).filter_by(id=opening_id).first()
    if not o:
        raise HTTPException(404, "Opening not found")
    progress_by_line = {
        p.line_id: p
        for p in db.query(models.LineProgress).filter(
            models.LineProgress.user_id == user.id,
            models.LineProgress.line_id.in_([line.id for line in o.lines]),
        ).all()
    }
    return OpeningOut(
        id=o.id, name=o.name, color=o.color, description=o.description,
        lines=[_line_out(line, progress_by_line.get(line.id)) for line in o.lines],
    )


@router.post("/{opening_id}/review", response_model=ReviewResult)
def submit_review(
    opening_id: str, body: ReviewRequest,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user),
):
    line = db.query(models.Line).filter_by(id=body.line_id, opening_id=opening_id).first()
    if not line:
        raise HTTPException(404, "Line not found")
    progress = _get_or_seed_progress(db, user, line)
    _sm2(progress, body.quality)
    db.commit()
    db.refresh(progress)
    return ReviewResult(
        next_review=progress.next_review.isoformat(),
        interval_days=progress.interval_days,
        retention=progress.retention,
    )
