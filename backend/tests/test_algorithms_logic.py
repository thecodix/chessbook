import chess

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
