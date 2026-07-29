import random
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.routers.games import _fen_from_prefix
from app.routers.repertoire import _ensure_default_selection
from app.sparring_logic import (
    LineInfo, StatsInfo, build_sparring_candidates, select_sparring_node,
)
from app import models

router = APIRouter()


def _strip_san(san: str) -> str:
    """Mirrors frontend/src/utils/chess.js:stripSan — strips only +/#, NOT
    games.py's `_strip` (which also removes 'x' for a different purpose)."""
    return re.sub(r"[+#]", "", san) if san else ""


def _stripped_moves(line: models.Line) -> list[str]:
    return [_strip_san(m) for m in line.moves]


# ── Schemas ────────────────────────────────────────────────────────────────────

class SparringNextOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    line_id:      int
    opening_id:   str
    opening_name: str
    ply_index:    int
    fen:          str
    color:        str
    moves_so_far: list[str]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/next", response_model=SparringNextOut)
def sparring_next(
    color: Literal["white", "black"] = Query(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _ensure_default_selection(db, user)
    selected_ids = [r[0] for r in db.query(models.UserOpening.opening_id).filter_by(user_id=user.id).all()]
    rows = (
        db.query(models.Line, models.Opening)
        .join(models.Opening)
        .filter(models.Opening.color == color, models.Opening.id.in_(selected_ids))
        .all()
    )
    if not rows:
        raise HTTPException(404, f"No {color} repertoire lines available for sparring")

    line_ids = [line.id for line, _ in rows]
    progress_by_line = {
        p.line_id: p
        for p in db.query(models.LineProgress).filter(
            models.LineProgress.user_id == user.id,
            models.LineProgress.line_id.in_(line_ids),
        ).all()
    }
    stats_map = {
        (s.line_id, s.ply_index): StatsInfo(
            attempts=s.sparring_attempts, last_result=s.last_sparring_result,
            last_attempt_at=s.last_attempt_at,
        )
        for s in db.query(models.SparringStats).filter(
            models.SparringStats.user_id == user.id,
            models.SparringStats.line_id.in_(line_ids),
        ).all()
    }

    line_infos = [
        LineInfo(
            line_id=line.id, opening_id=line.opening_id,
            moves=_stripped_moves(line),
            repetitions=progress_by_line[line.id].repetitions if line.id in progress_by_line else 0,
        )
        for line, _ in rows
    ]

    candidates = build_sparring_candidates(line_infos, stats_map, color)
    chosen = select_sparring_node(candidates, random.Random())
    if chosen is None:
        raise HTTPException(404, f"No {color} repertoire lines are deep enough for sparring yet (need >= 2 plies)")

    line, opening = next((l, o) for l, o in rows if l.id == chosen.line_id)
    stripped = _stripped_moves(line)
    prefix = stripped[: chosen.ply_index]
    fen = _fen_from_prefix(prefix)
    if fen is None:
        raise HTTPException(500, "Could not derive a position from this line")

    return SparringNextOut(
        line_id=line.id, opening_id=opening.id, opening_name=opening.name,
        ply_index=chosen.ply_index, fen=fen, color=color, moves_so_far=prefix,
    )
