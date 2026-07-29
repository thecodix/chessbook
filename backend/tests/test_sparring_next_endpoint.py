from app import models


def test_sparring_next_requires_auth():
    from app.auth import get_current_user
    from app.main import app
    app.dependency_overrides.pop(get_current_user, None)
    from fastapi.testclient import TestClient
    resp = TestClient(app).get("/api/sparring/next?color=white")
    assert resp.status_code == 401
    app.dependency_overrides.clear()


def test_sparring_next_404s_when_no_line_has_two_plies(client, db_session, test_user):
    opening = models.Opening(id="op1", name="Op1", color="white")
    line = models.Line(opening_id="op1", label="L1", moves=["e4"])
    db_session.add_all([opening, line])
    db_session.commit()
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 404


def test_sparring_next_returns_a_position(client, db_session, test_user):
    opening = models.Opening(id="op1", name="Op1", color="white")
    line = models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"])
    db_session.add_all([opening, line])
    db_session.commit()
    db_session.refresh(line)
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    body = resp.json()
    assert body["lineId"] == line.id
    assert body["plyIndex"] == 2
    assert body["color"] == "white"
    assert body["movesSoFar"] == ["e4", "e5"]
    assert body["fen"].split(" ")[1] == "w"   # ply_index=2 -> White to move next


def test_sparring_next_defaults_a_fresh_user_into_the_full_catalog(client, db_session, test_user):
    """A brand-new user who visits Sparring before ever touching the
    Repertoire tab has zero UserOpening rows. They should still see every
    catalog opening by default (mirrors repertoire.py's own routes via
    _ensure_default_selection), not a false 404."""
    opening = models.Opening(id="op1", name="Op1", color="white")
    line = models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"])
    db_session.add_all([opening, line])
    db_session.commit()
    # Deliberately no models.UserOpening row seeded here.

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    assert resp.json()["openingId"] == "op1"


def test_sparring_next_ignores_openings_not_in_the_users_selection(client, db_session, test_user):
    selected = models.Opening(id="op1", name="Selected", color="white")
    unselected = models.Opening(id="op2", name="Unselected", color="white")
    db_session.add_all([
        selected, unselected,
        models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"]),
        models.Line(opening_id="op2", label="L1", moves=["d4", "d5", "Bf4", "Nf6"]),
    ])
    db_session.commit()
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    assert resp.json()["openingId"] == "op1"
