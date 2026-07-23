import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

_SECRET  = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
_ALGO    = "HS256"
_EXPIRES = 30  # days

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/users/login", auto_error=False)


def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: int, username: str) -> str:
    expire = datetime.utcnow() + timedelta(days=_EXPIRES)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "exp": expire},
        _SECRET, algorithm=_ALGO,
    )


def _decode(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGO])
    except JWTError:
        return None


def get_current_user(
    token:  Optional[str] = Depends(oauth2),
    db:     Session       = Depends(get_db),
) -> models.User:
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = _decode(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user = db.query(models.User).filter_by(id=int(payload["sub"])).first()
    if not user:
        raise HTTPException(401, "User not found")
    return user


def get_optional_user(
    token: Optional[str] = Depends(oauth2),
    db:    Session       = Depends(get_db),
) -> Optional[models.User]:
    if not token:
        return None
    payload = _decode(token)
    if not payload:
        return None
    return db.query(models.User).filter_by(id=int(payload["sub"])).first()
