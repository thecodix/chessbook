from typing import Optional

import chess
import chess.engine
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

router = APIRouter()

ANALYSIS_TIME = 0.5  # seconds of engine time per position


class DeviationAnalysisOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    expected_move:    str
    played_move:      str
    engine_best_move: str
    engine_best_line: list[str]
    eval_expected:    Optional[float]
    eval_played:      Optional[float]
    eval_best:        Optional[float]
    pawns_lost:       Optional[float]
    explanation:      str


def _strip(m: str) -> str:
    return m.replace('+', '').replace('#', '').replace('!', '').replace('?', '').replace('x', '')


def _cp_to_pawns(score: "chess.engine.PovScore") -> Optional[float]:
    cp = score.white().score(mate_score=100000)
    return None if cp is None else cp / 100


@router.get("/deviation/{game_id}", response_model=DeviationAnalysisOut)
async def analyze_deviation(game_id: str, request: Request, db: Session = Depends(get_db)):
    engine_proc = getattr(request.app.state, "stockfish", None)
    if engine_proc is None:
        raise HTTPException(503, "Stockfish engine is not available on this server")

    game = db.query(models.Game).filter_by(id=game_id).first()
    if not game or not game.deviation:
        raise HTTPException(404, "Game or deviation not found")

    dev = game.deviation
    move_num = dev.get("move")
    expected = dev.get("expected")
    played   = dev.get("played")
    if not move_num or not expected or not played:
        raise HTTPException(400, "Incomplete deviation data")

    moves = game.moves or []
    ply = None
    for candidate in (2 * (move_num - 1), 2 * (move_num - 1) + 1):
        if candidate < len(moves) and _strip(moves[candidate]) == _strip(played):
            ply = candidate
            break
    if ply is None:
        raise HTTPException(400, "Could not locate the deviation ply in the move list")

    board = chess.Board()
    try:
        for mv in moves[:ply]:
            board.push_san(mv)
    except ValueError:
        raise HTTPException(400, "Could not replay game moves up to the deviation")

    sign = 1 if board.turn == chess.WHITE else -1

    async with request.app.state.stockfish_lock:
        limit = chess.engine.Limit(time=ANALYSIS_TIME)

        info_base = await engine_proc.analyse(board, limit)
        best_move = info_base["pv"][0]
        eval_best = _cp_to_pawns(info_base["score"])
        best_move_san = board.san(best_move)

        best_line_san = []
        pv_board = board.copy()
        for mv in info_base.get("pv", [])[:6]:
            best_line_san.append(pv_board.san(mv))
            pv_board.push(mv)

        eval_expected = None
        try:
            board_expected = board.copy()
            board_expected.push_san(expected)
            info_expected = await engine_proc.analyse(board_expected, limit)
            eval_expected = _cp_to_pawns(info_expected["score"])
        except ValueError:
            pass

        eval_played = None
        try:
            board_played = board.copy()
            board_played.push_san(played)
            info_played = await engine_proc.analyse(board_played, limit)
            eval_played = _cp_to_pawns(info_played["score"])
        except ValueError:
            pass

    pawns_lost = None
    if eval_expected is not None and eval_played is not None:
        pawns_lost = round(sign * (eval_expected - eval_played), 2)

    if pawns_lost is None:
        explanation = "Could not fully evaluate this position."
    elif pawns_lost <= 0.05:
        explanation = "Your move was about as good as the book move — no real harm done."
    elif pawns_lost < 0.5:
        explanation = "Minor inaccuracy — the book move was slightly more precise."
    elif pawns_lost < 1.5:
        explanation = f"The book move was clearly better. The engine's top choice here is {best_move_san}."
    else:
        explanation = (
            f"Significant mistake — you gave up about {pawns_lost} pawns of evaluation. "
            f"The engine's top choice here was {best_move_san}."
        )

    return DeviationAnalysisOut(
        expected_move=expected,
        played_move=played,
        engine_best_move=best_move_san,
        engine_best_line=best_line_san,
        eval_expected=eval_expected,
        eval_played=eval_played,
        eval_best=eval_best,
        pawns_lost=pawns_lost,
        explanation=explanation,
    )
