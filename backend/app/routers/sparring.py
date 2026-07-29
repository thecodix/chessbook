import random
import re
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.routers.games import _fen_from_prefix
from app.routers.repertoire import _ensure_default_selection
from app.sparring_logic import (
    LineInfo, StatsInfo, build_sparring_candidates, select_sparring_node,
    choose_opponent_move, classify_user_move,
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


class SparringEvaluateIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    line_id:       int
    ply_index:     int = Field(ge=0)
    move_played:   str
    # The actual path played so far in THIS session (not necessarily the seed
    # line's own continuation — the rival's reply is chosen from among
    # sibling lines and can diverge after move 1). Authoritative for
    # reconstructing the board position; line_id/ply_index are kept only for
    # the SparringStats composite-key attribution below, never for replaying
    # moves. Defaults to [] so older/degenerate calls don't 422, though any
    # ply_index > 0 without a matching moves_so_far will simply fail to match
    # any sibling line.
    moves_so_far:  list[str] = []


class SparringEvaluateOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    result:         str
    opponent_move:  Optional[str] = None
    opponent_fen:   Optional[str] = None
    session_over:   bool


@router.post("/evaluate", response_model=SparringEvaluateOut)
def sparring_evaluate(
    body: SparringEvaluateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    line = db.query(models.Line).filter_by(id=body.line_id).first()
    if not line:
        raise HTTPException(404, "Line not found")

    _ensure_default_selection(db, user)
    owns_opening = db.query(models.UserOpening).filter_by(
        user_id=user.id, opening_id=line.opening_id,
    ).first()
    if owns_opening is None:
        raise HTTPException(404, "Opening not in your repertoire selection")

    sibling_lines = db.query(models.Line).filter_by(opening_id=line.opening_id).all()
    stripped_by_line = {sib.id: _stripped_moves(sib) for sib in sibling_lines}

    # `prefix` is the ACTUAL path played so far in this session, as reported
    # by the client — not re-derived from the seed line's own move list,
    # which can diverge from the real game after the rival's first reply
    # (see choose_opponent_move). Its length is used positionally in place
    # of body.ply_index everywhere except the SparringStats key below.
    prefix = [_strip_san(m) for m in body.moves_so_far]
    ply = len(prefix)
    matching = [mv for mv in stripped_by_line.values() if mv[:ply] == prefix]

    move_played = _strip_san(body.move_played)
    result = classify_user_move(matching, ply, move_played)

    stats = db.query(models.SparringStats).filter_by(
        user_id=user.id, line_id=body.line_id, ply_index=body.ply_index,
    ).first()
    if stats is None:
        stats = models.SparringStats(
            user_id=user.id, line_id=body.line_id, ply_index=body.ply_index,
            sparring_attempts=0, sparring_correct=0,
        )
        db.add(stats)
    stats.sparring_attempts += 1
    if result == "correct":
        stats.sparring_correct += 1
    stats.last_sparring_result = result
    stats.last_attempt_at = datetime.utcnow()
    db.commit()

    opponent_move: Optional[str] = None
    opponent_fen:  Optional[str] = None
    if result == "correct":
        continuing = [mv for mv in matching if len(mv) > ply and mv[ply] == move_played]
        opponent_move = choose_opponent_move(continuing, ply + 1, random.Random())
        if opponent_move is not None:
            opponent_fen = _fen_from_prefix(prefix + [move_played, opponent_move])

    return SparringEvaluateOut(
        result=result, opponent_move=opponent_move, opponent_fen=opponent_fen,
        session_over=(result != "correct" or opponent_move is None),
    )
