"""Хүсэлт бүрд аль салбарын DB-тэй ажиллахыг тодорхойлно.

Дараалал:
  1. Authorization токены `branch` талбар — нэвтэрсэн хэрэглэгч. Токен нь
     гарын үсэгтэй тул header солиод өөр салбар руу орох боломжгүй.
  2. `X-Branch` header — нэвтрэлтгүй хандалт (нэвтрэх хуудас, ТВ дэлгэц).
  3. Эхний идэвхтэй салбар — хуучин клиент/скриптүүд ажиллаж байхын тулд.
"""
from fastapi import HTTPException, Request
from jose import JWTError, jwt

import central


def _jwt_conf():
    # auth → database → branch_ctx гэсэн дугуй импортоос сэргийлж хойшлуулна
    from auth import ALGORITHM, SECRET_KEY
    return SECRET_KEY, ALGORITHM


def branch_code_from_request(request: Request):
    auth = request.headers.get("authorization") or ""
    if auth[:7].lower() == "bearer ":
        try:
            secret, alg = _jwt_conf()
            code = jwt.decode(auth[7:], secret, algorithms=[alg]).get("branch")
            if code:
                return code
        except (JWTError, KeyError, ValueError):
            pass          # хугацаа дууссан/эвдэрсэн токен — header рүү шилжинэ
    return request.headers.get("x-branch") or None


def resolve_branch(request: Request):
    """Хүсэлтэд харгалзах Branch. Олдохгүй бол эхний идэвхтэй салбар."""
    code = branch_code_from_request(request)
    branch = central.get_branch(code) if code else None
    if branch is None or not branch.is_active:
        branch = central.default_branch()
    if branch is None:
        raise HTTPException(status_code=503, detail="Салбар бүртгэгдээгүй байна")
    return branch
