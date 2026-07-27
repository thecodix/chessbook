from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app import models

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    puzzle_id: str
    solved:    bool
    attempts:  int


class ProgressUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    solved: bool


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/progress", response_model=list[ProgressOut])
def list_progress(
    db:   Session      = Depends(get_db),
    user: models.User  = Depends(get_current_user),
):
    return db.query(models.ProblemProgress).filter_by(user_id=user.id).all()


@router.post("/progress/{puzzle_id}", response_model=ProgressOut)
def update_progress(
    puzzle_id: str,
    body:      ProgressUpdate,
    db:        Session     = Depends(get_db),
    user:      models.User = Depends(get_current_user),
):
    row = (
        db.query(models.ProblemProgress)
        .filter_by(user_id=user.id, puzzle_id=puzzle_id)
        .first()
    )
    if not row:
        row = models.ProblemProgress(user_id=user.id, puzzle_id=puzzle_id, attempts=0, solved=False)
        db.add(row)

    row.attempts += 1
    if body.solved and not row.solved:
        row.solved    = True
        row.solved_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return row
