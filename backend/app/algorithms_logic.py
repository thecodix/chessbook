"""Pure, engine-agnostic terminal-state classification for live-engine
endgame drills (Endgame Algorithms mode). Kept separate from any Stockfish
call so it's fully unit-testable without a real engine process — mirrors
the pure/impure split in app/sparring_logic.py."""
from typing import Optional

import chess


def classify_position(fen: str) -> Optional[str]:
    """Returns "checkmate" | "stalemate" | "draw" if `fen` is terminal, or
    None if the game should continue. "draw" here covers only the 75-move
    rule (chess.Board.is_seventyfive_moves) — fully determinable from a
    single FEN's halfmove clock, no game history needed. Three-fold
    repetition is deliberately NOT detected (see
    docs/superpowers/specs/2026-07-29-endgame-algorithms-design.md)."""
    board = chess.Board(fen)
    if board.is_checkmate():
        return "checkmate"
    if board.is_stalemate():
        return "stalemate"
    if board.is_seventyfive_moves():
        return "draw"
    return None
