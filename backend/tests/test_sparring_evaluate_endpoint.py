# backend/tests/test_sparring_evaluate_endpoint.py
from app import models


def _setup_sicilian(db_session):
    opening = models.Opening(id="op1", name="Sicilian", color="black")
    line_a = models.Line(opening_id="op1", label="A", moves=["e4", "c5", "Nf3", "d6", "d4", "cxd4"])
    line_b = models.Line(opening_id="op1", label="B", moves=["e4", "c5", "Nf3", "Nc6", "Bb5", "a6"])
    db_session.add_all([opening, line_a, line_b])
    db_session.commit()
    db_session.refresh(line_a)
    db_session.refresh(line_b)
    return line_a, line_b


def test_evaluate_correct_move_via_transposition_returns_opponent_reply(client, db_session, test_user):
    line_a, line_b = _setup_sicilian(db_session)

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_b.id, "plyIndex": 3, "movePlayed": "d6",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == "correct"
    assert body["opponentMove"] == "d4"
    assert body["opponentFen"]
    assert body["sessionOver"] is False


def test_evaluate_unknown_move_ends_the_session(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "a6",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == "unknown"
    assert body["opponentMove"] is None
    assert body["sessionOver"] is True


def test_evaluate_persists_sparring_stats(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6"})

    stats = db_session.query(models.SparringStats).filter_by(
        user_id=test_user.id, line_id=line_a.id, ply_index=3,
    ).first()
    assert stats is not None
    assert stats.sparring_attempts == 1
    assert stats.sparring_correct == 1
    assert stats.last_sparring_result == "correct"


def test_evaluate_second_attempt_at_same_node_increments_attempts(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "a6"})
    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6"})

    stats = db_session.query(models.SparringStats).filter_by(
        user_id=test_user.id, line_id=line_a.id, ply_index=3,
    ).first()
    assert stats.sparring_attempts == 2
    assert stats.sparring_correct == 1
    assert stats.last_sparring_result == "correct"


def test_evaluate_requires_auth():
    from app.auth import get_current_user
    from app.main import app
    from fastapi.testclient import TestClient
    app.dependency_overrides.pop(get_current_user, None)
    resp = TestClient(app).post("/api/sparring/evaluate", json={"lineId": 1, "plyIndex": 1, "movePlayed": "e5"})
    assert resp.status_code == 401
    app.dependency_overrides.clear()
