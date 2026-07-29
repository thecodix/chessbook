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
        "movesSoFar": ["e4", "c5", "Nf3"],
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
        "movesSoFar": ["e4", "c5", "Nf3"],
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == "unknown"
    assert body["opponentMove"] is None
    assert body["sessionOver"] is True


def test_evaluate_persists_sparring_stats(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6",
        "movesSoFar": ["e4", "c5", "Nf3"],
    })

    stats = db_session.query(models.SparringStats).filter_by(
        user_id=test_user.id, line_id=line_a.id, ply_index=3,
    ).first()
    assert stats is not None
    assert stats.sparring_attempts == 1
    assert stats.sparring_correct == 1
    assert stats.last_sparring_result == "correct"


def test_evaluate_second_attempt_at_same_node_increments_attempts(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "a6",
        "movesSoFar": ["e4", "c5", "Nf3"],
    })
    client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6",
        "movesSoFar": ["e4", "c5", "Nf3"],
    })

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


def test_evaluate_negative_ply_index_is_rejected_with_422(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": -1, "movePlayed": "d6", "movesSoFar": [],
    })
    assert resp.status_code == 422


def test_evaluate_404s_when_opening_not_in_the_users_selection(client, db_session, test_user):
    selected = models.Opening(id="op1", name="Selected", color="white")
    unselected = models.Opening(id="op2", name="Unselected", color="white")
    line_selected = models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"])
    line_unselected = models.Line(opening_id="op2", label="L1", moves=["d4", "d5", "Bf4", "Nf6"])
    db_session.add_all([selected, unselected, line_selected, line_unselected])
    db_session.commit()
    db_session.refresh(line_unselected)
    # Explicitly select only op1 — this also means _ensure_default_selection's
    # "brand new user" fallback (seed everything) does NOT kick in, since the
    # user already has at least one UserOpening row.
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_unselected.id, "plyIndex": 2, "movePlayed": "Bf4",
        "movesSoFar": ["d4", "d5"],
    })
    assert resp.status_code == 404


def test_evaluate_second_call_judges_against_the_actual_rival_reply_not_the_seed_line(client, db_session, test_user):
    """Regression test for the critical whole-branch-review finding: the
    rival's reply is chosen from among sibling lines and can diverge from
    the seed line (`line_a`, the line_id the session started from) after
    the first move. A second /evaluate call in the same session must be
    judged against the position that ACTUALLY resulted from the first
    call's rival reply, not re-derived from line_a's own move list.

    line_a ends at ply 4 ("...d6") with no further moves recorded, so it
    cannot possibly supply the rival's reply. line_c is the only sibling
    with a continuation past that point, so choose_opponent_move's
    (otherwise random) choice is deterministic here: it must play "Be2".
    """
    opening = models.Opening(id="op1", name="Sicilian", color="black")
    # Deliberately ends right after the user's first move — cannot be the
    # source of the rival's reply, unlike the pre-fix code assumed.
    line_a = models.Line(opening_id="op1", label="A", moves=["e4", "c5", "Nf3", "d6"])
    line_c = models.Line(opening_id="op1", label="C", moves=["e4", "c5", "Nf3", "d6", "Be2", "Nf6"])
    db_session.add_all([opening, line_a, line_c])
    db_session.commit()
    db_session.refresh(line_a)
    db_session.refresh(line_c)

    # First call: session started from line_a at ply_index=3 ("...d6").
    first = client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6",
        "movesSoFar": ["e4", "c5", "Nf3"],
    })
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["result"] == "correct"
    assert first_body["opponentMove"] == "Be2"   # deterministic: only line_c continues

    # Second call: the client reports the REAL path, including the rival's
    # actual "Be2" reply (which is NOT part of line_a's own move list).
    real_moves_so_far = ["e4", "c5", "Nf3", "d6", "Be2"]
    second = client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 5, "movePlayed": "Nf6",
        "movesSoFar": real_moves_so_far,
    })
    assert second.status_code == 200
    second_body = second.json()
    # Pre-fix, the server re-derived the prefix from line_a's own (4-move)
    # list, which can never match a 5-move prefix, so this would incorrectly
    # come back "unknown" instead of "correct".
    assert second_body["result"] == "correct"
