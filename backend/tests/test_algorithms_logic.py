import chess
import pytest

from app.algorithms_logic import classify_position


def test_classify_position_detects_checkmate():
    # Fool's Mate: 1.f3 e5 2.g4 Qh4# — White to move, checkmated.
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    assert classify_position(fen) == "checkmate"


def test_classify_position_detects_stalemate():
    # Classic queen-stalemate trap: Black to move, no legal moves, not in check.
    fen = "k7/8/1Q6/8/8/8/8/7K b - - 0 1"
    assert classify_position(fen) == "stalemate"


def test_classify_position_detects_seventy_five_move_draw():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 150 90"
    assert classify_position(fen) == "draw"


def test_classify_position_returns_none_for_an_ongoing_game():
    board = chess.Board()
    board.push_san("e4")
    board.push_san("e5")
    assert classify_position(board.fen()) is None


def test_classify_position_returns_none_for_the_starting_position():
    assert classify_position(chess.Board().fen()) is None


def test_classify_position_detects_insufficient_material():
    # K+B vs. lone K — the user blundered their bishop and can never force
    # checkmate anymore. Verified non-terminal otherwise: not check, not
    # stalemate (5 legal moves for the black king).
    fen = "4k3/8/8/8/8/8/8/4KB2 b - - 0 40"
    board = chess.Board(fen)
    assert not board.is_check()
    assert not board.is_stalemate()
    assert classify_position(fen) == "insufficient_material"


def test_classify_position_raises_on_malformed_fen():
    # Pure function keeps a simple contract: it raises on bad input. It's
    # the endpoint's job (the actual system boundary) to catch this and
    # translate it into a proper HTTP error, not this function's.
    with pytest.raises(ValueError):
        classify_position("not-a-fen")


def test_classify_position_returns_none_when_in_check_but_not_checkmate():
    # 1.e4 e5 2.Qh5 g6 3.Qxe5+ — Black is in check but has legal replies
    # (Ne7, Be7, Qe7). Must not be misclassified as checkmate.
    board = chess.Board()
    for move in ("e4", "e5", "Qh5", "g6", "Qxe5+"):
        board.push_san(move)
    assert board.is_check()
    assert not board.is_checkmate()
    assert classify_position(board.fen()) is None
