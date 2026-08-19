import logging
import os

import resend

logger = logging.getLogger(__name__)

_FROM_ADDRESS = "Chessbook <onboarding@resend.dev>"


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        # .warning, not .info — the root logger defaults to WARNING with no
        # config elsewhere in the app, so .info would be silently swallowed
        # under a real uvicorn run and this fallback would go unnoticed.
        logger.warning("RESEND_API_KEY not set — password reset link for %s: %s", to_email, reset_url)
        return

    resend.api_key = api_key
    resend.Emails.send({
        "from": _FROM_ADDRESS,
        "to": to_email,
        "subject": "Reset your Chessbook password",
        "html": (
            "<p>Click the link below to reset your Chessbook password. "
            "This link expires in 60 minutes.</p>"
            f'<p><a href="{reset_url}">{reset_url}</a></p>'
        ),
    })
