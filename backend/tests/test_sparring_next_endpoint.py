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


def test_sparring_next_defaults_a_fresh_user_into_curated_openings(client, db_session, test_user):
    """A fresh user gets curated defaults, not every catalog opening."""
    london = models.Opening(id="london", name="London", color="white")
    london_line = models.Line(opening_id="london", label="L1", moves=["d4", "d5", "Bf4", "Nf6"])
    uncurated = models.Opening(id="op1", name="Other", color="white")
    uncurated_line = models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"])
    db_session.add_all([london, london_line, uncurated, uncurated_line])
    db_session.commit()
    # Deliberately no models.UserOpening row seeded here.

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    assert resp.json()["openingId"] == "london"
    selected_ids = {
        row.opening_id
        for row in db_session.query(models.UserOpening).filter_by(user_id=test_user.id)
    }
    assert selected_ids == {"london"}


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
