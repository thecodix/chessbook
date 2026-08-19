import logging

import resend

from app.email import send_password_reset_email


def test_logs_the_link_instead_of_sending_when_no_api_key(monkeypatch, caplog):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    def _fail_if_called(*a, **k):
        raise AssertionError("resend.Emails.send should not be called without an API key")

    monkeypatch.setattr(resend.Emails, "send", _fail_if_called)

    with caplog.at_level(logging.INFO):
        send_password_reset_email("user@example.com", "https://chessbook.example/reset-password?token=abc")

    assert "https://chessbook.example/reset-password?token=abc" in caplog.text
    assert "user@example.com" in caplog.text


def test_sends_via_resend_when_api_key_is_configured(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    calls = []
    monkeypatch.setattr(resend.Emails, "send", lambda params: calls.append(params))

    send_password_reset_email("user@example.com", "https://chessbook.example/reset-password?token=abc")

    assert len(calls) == 1
    assert calls[0]["to"] == "user@example.com"
    assert "https://chessbook.example/reset-password?token=abc" in calls[0]["html"]
