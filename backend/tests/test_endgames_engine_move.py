import asyncio
from types import SimpleNamespace

import chess
import pytest

from app.main import app


class _FakeEngine:
    """Test double for app.state.stockfish. Only .play() is ever called by
    the endpoint under test; returns a canned move via a SimpleNamespace
    standing in for chess.engine.PlayResult (only .move is read)."""
    def __init__(self, reply_move):
        self.reply_move = reply_move
        self.play_called = False

    async def play(self, board, limit):
        self.play_called = True
        return SimpleNamespace(move=self.reply_move)


@pytest.fixture()
def stockfish_state():
    app.state.stockfish_lock = asyncio.Lock()
    yield app.state
    app.state.stockfish = None


def test_engine_move_requires_auth():
    from app.auth import get_current_user
    from fastapi.testclient import TestClient
    app.dependency_overrides.pop(get_current_user, None)
    resp = TestClient(app).post("/api/endgames/engine-move", json={"fen": chess.Board().fen()})
    assert resp.status_code == 401
    app.dependency_overrides.clear()


def test_engine_move_503s_when_engine_unavailable(client, stockfish_state):
    stockfish_state.stockfish = None
    resp = client.post("/api/endgames/engine-move", json={"fen": chess.Board().fen()})
    assert resp.status_code == 503


def test_engine_move_returns_checkmate_without_calling_the_engine(client, stockfish_state):
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # Fool's Mate
    fake = _FakeEngine(reply_move=None)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": fen})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "checkmate"
    assert body["engineMove"] is None
    assert body["fen"] is None
    assert fake.play_called is False


def test_engine_move_returns_stalemate_without_calling_the_engine(client, stockfish_state):
    fen = "k7/8/1Q6/8/8/8/8/7K b - - 0 1"
    fake = _FakeEngine(reply_move=None)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": fen})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "stalemate"
    assert fake.play_called is False


def test_engine_move_plays_a_reply_when_the_game_continues(client, stockfish_state):
    board = chess.Board()
    board.push_san("e4")
    board.push_san("e5")
    reply = next(iter(board.legal_moves))
    expected_san = board.san(reply)
    board_after = board.copy()
    board_after.push(reply)

    fake = _FakeEngine(reply_move=reply)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": board.fen()})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "in_progress"
    assert body["engineMove"] == expected_san
    assert body["fen"] == board_after.fen()
    assert fake.play_called is True
