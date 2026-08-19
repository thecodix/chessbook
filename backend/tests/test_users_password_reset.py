from datetime import datetime, timedelta

from app import models
from app.auth import hash_reset_token


def test_register_rejects_missing_email_field(client):
    resp = client.post("/api/users/register", json={"username": "newuser", "password": "pw"})
    assert resp.status_code == 422


def test_register_rejects_blank_email(client):
    resp = client.post("/api/users/register", json={"username": "newuser", "password": "pw", "email": "   "})
    assert resp.status_code == 400


def test_register_stores_and_returns_email(client, db_session):
    resp = client.post("/api/users/register", json={
        "username": "newuser", "password": "pw", "email": "newuser@example.com",
    })
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "newuser@example.com"
    stored = db_session.query(models.User).filter_by(username="newuser").first()
    assert stored.email == "newuser@example.com"


def test_register_rejects_duplicate_email(client, test_user):
    resp = client.post("/api/users/register", json={
        "username": "someoneelse", "password": "pw", "email": test_user.email,
    })
    assert resp.status_code == 400


def test_forgot_password_returns_generic_message_for_known_email(client, test_user, monkeypatch):
    sent = []
    monkeypatch.setattr("app.routers.users.send_password_reset_email", lambda to, url: sent.append((to, url)))

    resp = client.post("/api/users/forgot-password", json={"email": test_user.email})

    assert resp.status_code == 200
    assert len(sent) == 1
    assert sent[0][0] == test_user.email


def test_forgot_password_returns_same_generic_message_for_unknown_email(client, monkeypatch):
    sent = []
    monkeypatch.setattr("app.routers.users.send_password_reset_email", lambda to, url: sent.append((to, url)))

    known = client.post("/api/users/forgot-password", json={"email": "unknown@example.com"})

    assert known.status_code == 200
    assert len(sent) == 0  # no matching account, nothing sent — but response looks the same


def test_forgot_password_sets_a_hashed_reset_token_on_the_user(client, test_user, db_session, monkeypatch):
    monkeypatch.setattr("app.routers.users.send_password_reset_email", lambda to, url: None)

    client.post("/api/users/forgot-password", json={"email": test_user.email})

    db_session.refresh(test_user)
    assert test_user.reset_token_hash is not None
    assert test_user.reset_token_expires > datetime.utcnow()


def test_forgot_password_is_rate_limited_per_ip(client, test_user, monkeypatch):
    monkeypatch.setattr("app.routers.users.send_password_reset_email", lambda to, url: None)

    for _ in range(5):
        resp = client.post("/api/users/forgot-password", json={"email": test_user.email})
        assert resp.status_code == 200

    resp = client.post("/api/users/forgot-password", json={"email": test_user.email})
    assert resp.status_code == 429


def test_reset_password_with_valid_token_updates_password(client, test_user, db_session):
    raw_token = "raw-token-value"
    test_user.reset_token_hash = hash_reset_token(raw_token)
    test_user.reset_token_expires = datetime.utcnow() + timedelta(minutes=30)
    db_session.commit()

    resp = client.post("/api/users/reset-password", json={"token": raw_token, "newPassword": "newpw123"})
    assert resp.status_code == 200

    login = client.post("/api/users/login", json={"username": test_user.username, "password": "newpw123"})
    assert login.status_code == 200


def test_reset_password_clears_the_token_after_use(client, test_user, db_session):
    raw_token = "raw-token-value"
    test_user.reset_token_hash = hash_reset_token(raw_token)
    test_user.reset_token_expires = datetime.utcnow() + timedelta(minutes=30)
    db_session.commit()

    client.post("/api/users/reset-password", json={"token": raw_token, "newPassword": "newpw123"})

    resp = client.post("/api/users/reset-password", json={"token": raw_token, "newPassword": "anotherpw"})
    assert resp.status_code == 400


def test_reset_password_rejects_expired_token(client, test_user, db_session):
    raw_token = "raw-token-value"
    test_user.reset_token_hash = hash_reset_token(raw_token)
    test_user.reset_token_expires = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()

    resp = client.post("/api/users/reset-password", json={"token": raw_token, "newPassword": "newpw123"})
    assert resp.status_code == 400


def test_reset_password_rejects_unknown_token(client):
    resp = client.post("/api/users/reset-password", json={"token": "garbage", "newPassword": "newpw123"})
    assert resp.status_code == 400
