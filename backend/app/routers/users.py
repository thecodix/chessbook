from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import hash_pw, verify_pw, make_token, get_current_user

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    username:          str
    password:          str
    chesscom_username: Optional[str] = None
    platform_rating:   Optional[int] = None


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)
    id:                int
    username:          str
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
    if not uname:
        raise HTTPException(400, "Username is required")
    if db.query(models.User).filter_by(username=uname).first():
        raise HTTPException(400, "Username already taken")
    user = models.User(
        username=uname,
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
