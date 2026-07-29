from datetime import datetime
from typing import Optional

import chess
import chess.engine
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.algorithms_logic import classify_position
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
    return db.query(models.EndgameProgress).filter_by(user_id=user.id).all()


@router.post("/progress/{puzzle_id}", response_model=ProgressOut)
def update_progress(
    puzzle_id: str,
    body:      ProgressUpdate,
    db:        Session     = Depends(get_db),
    user:      models.User = Depends(get_current_user),
):
    row = (
        db.query(models.EndgameProgress)
        .filter_by(user_id=user.id, puzzle_id=puzzle_id)
        .first()
    )
    if not row:
        row = models.EndgameProgress(user_id=user.id, puzzle_id=puzzle_id, attempts=0, solved=False)
        db.add(row)

    row.attempts += 1
    if body.solved and not row.solved:
        row.solved    = True
        row.solved_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return row


# ── Endgame Algorithms (live engine) ────────────────────────────────────────────

ENGINE_MOVE_LIMIT = chess.engine.Limit(depth=22)  # deep relative to analysis.py's 0.5s quick-eval budget


class EngineMoveIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    fen: str


class EngineMoveOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    status:      str
    engine_move: Optional[str] = None
    fen:         Optional[str] = None


@router.post("/engine-move", response_model=EngineMoveOut)
async def engine_move(
    body: EngineMoveIn,
    request: Request,
    user: models.User = Depends(get_current_user),
):
    status = classify_position(body.fen)
    if status is not None:
        return EngineMoveOut(status=status)

    engine_proc = getattr(request.app.state, "stockfish", None)
    if engine_proc is None:
        raise HTTPException(503, "Stockfish engine is not available on this server")

    board = chess.Board(body.fen)
    async with request.app.state.stockfish_lock:
        result = await engine_proc.play(board, ENGINE_MOVE_LIMIT)

    engine_move_san = board.san(result.move)
    board.push(result.move)
    new_status = classify_position(board.fen())

    return EngineMoveOut(
        status=new_status or "in_progress",
        engine_move=engine_move_san,
        fen=board.fen(),
    )
