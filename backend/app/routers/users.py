import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import (
    hash_pw, verify_pw, make_token, get_current_user,
    make_reset_token, hash_reset_token, RESET_TOKEN_EXPIRES_MINUTES,
)
from app.email import send_password_reset_email
from app.rate_limit import rate_limiter

router = APIRouter()

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
_GENERIC_FORGOT_PASSWORD_MESSAGE = "If that email is registered, a reset link has been sent."


# ── Schemas ────────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    username:          str
    email:             str
    password:          str
    chesscom_username: Optional[str] = None
    platform_rating:   Optional[int] = None


class LoginIn(BaseModel):
    username: str
    password: str


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    token:        str
    new_password: str


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)
    id:                int
    username:          str
    email:             str
    chesscom_username: Optional[str]
    platform_rating:   Optional[int]


class TokenOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    uname = (body.username or "").strip()
    email = (body.email or "").strip().lower()
    if not uname:
        raise HTTPException(400, "Username is required")
    if not email:
        raise HTTPException(400, "Email is required")
    if db.query(models.User).filter_by(username=uname).first():
        raise HTTPException(400, "Username already taken")
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(400, "Email already registered")
    user = models.User(
        username=uname,
        email=email,
        hashed_password=hash_pw(body.password),
        chesscom_username=(body.chesscom_username or "").strip() or None,
        platform_rating=body.platform_rating,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        access_token=make_token(user.id, user.username),
        user=UserOut.model_validate(user),
    )


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(
    body: ForgotPasswordIn,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(rate_limiter("forgot-password", max_requests=5, window_seconds=3600)),
):
    email = (body.email or "").strip().lower()
    user = db.query(models.User).filter_by(email=email).first()
    if user:
        raw_token, hashed = make_reset_token()
        user.reset_token_hash = hashed
        user.reset_token_expires = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRES_MINUTES)
        db.commit()
        reset_url = f"{_FRONTEND_URL}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, reset_url)
    return MessageOut(message=_GENERIC_FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    hashed = hash_reset_token(body.token)
    user = db.query(models.User).filter_by(reset_token_hash=hashed).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired reset link")
    user.hashed_password = hash_pw(body.new_password)
    user.reset_token_hash = None
    user.reset_token_expires = None
    db.commit()
    return MessageOut(message="Password updated — you can now sign in.")


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(username=(body.username or "").strip()).first()
    if not user or not verify_pw(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid username or password")
    return TokenOut(
        access_token=make_token(user.id, user.username),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me/rating", response_model=UserOut)
def update_rating(
    rating:       int,
    current_user: models.User = Depends(get_current_user),
    db:           Session     = Depends(get_db),
):
    current_user.platform_rating = rating
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.patch("/me/chesscom-username", response_model=UserOut)
def update_chesscom_username(
    chesscom_username: str,
    current_user:       models.User = Depends(get_current_user),
    db:                 Session     = Depends(get_db),
):
    current_user.chesscom_username = chesscom_username.strip() or None
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)
