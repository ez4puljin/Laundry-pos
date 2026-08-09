import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
import bcrypt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
import models

SECRET_KEY  = os.getenv("SECRET_KEY", "cemby-laundry-2024-secret-xK9mP3v7")
ALGORITHM   = "HS256"
TOKEN_HOURS = 12

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: int, role: str) -> str:
    expire  = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db:    Session = Depends(get_db),
) -> "models.User":
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Нэвтрэх эрх байхгүй",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise exc

    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.is_active == True,
    ).first()
    if user is None:
        raise exc
    return user


def require_admin(
    current_user: "models.User" = Depends(get_current_user),
) -> "models.User":
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Зөвхөн админ хандах боломжтой",
        )
    return current_user
