"""Салбар (branch) ба глобал хэрэглэгчийн удирдлага.

· Салбар нэмэх/засах — ЗӨВХӨН админ
· Салбар бүр өөрийн DB файлтай, өгөгдөл огт холилдохгүй
· Глобал хэрэглэгч (админ, нягтлан) бүх салбарт нэг бүртгэлээр нэвтэрнэ
"""
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

import central
import models
from auth import (
    create_access_token, get_current_user, hash_password, require_admin,
    require_global,
)
from central import Branch, GlobalUser, central_db
from schemas import UserOut

router        = APIRouter(prefix="/branches", tags=["branches"])
public_router = APIRouter(prefix="/public",   tags=["branches"])
users_router  = APIRouter(prefix="/global-users", tags=["branches"])
auth_router   = APIRouter(prefix="/auth",     tags=["branches"])


# ── Схем ───────────────────────────────────────────────
class BranchBrief(BaseModel):
    """Нэвтрэх өмнөх сонголтод хэрэгтэй хамгийн бага мэдээлэл."""
    id:      int
    code:    str
    name:    str
    address: Optional[str] = None

    class Config:
        from_attributes = True


class BranchOut(BranchBrief):
    phone:      Optional[str] = None
    is_active:  bool
    sort_order: int
    db_file:    str
    created_at: Optional[datetime] = None


class BranchCreate(BaseModel):
    name:    str
    address: Optional[str] = None
    phone:   Optional[str] = None


class BranchUpdate(BaseModel):
    name:       Optional[str]  = None
    address:    Optional[str]  = None
    phone:      Optional[str]  = None
    is_active:  Optional[bool] = None
    sort_order: Optional[int]  = None


class GlobalUserOut(BaseModel):
    id:         int
    username:   str
    full_name:  str
    role:       str
    is_active:  bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GlobalUserCreate(BaseModel):
    username:  str
    full_name: str
    password:  str
    role:      str = "accountant"     # admin | accountant


class GlobalUserUpdate(BaseModel):
    full_name: Optional[str]  = None
    role:      Optional[str]  = None
    is_active: Optional[bool] = None
    password:  Optional[str]  = None


class SwitchBranch(BaseModel):
    branch_code: str


class SwitchResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
    branch:       BranchBrief


# ── Нэвтрэлтгүй: салбарын жагсаалт ─────────────────────
@public_router.get("/branches", response_model=List[BranchBrief])
def public_branches(db: Session = Depends(central_db)):
    """Нэвтрэх өмнө салбар сонгох жагсаалт."""
    return (db.query(Branch)
              .filter(Branch.is_active == True)
              .order_by(Branch.sort_order, Branch.id)
              .all())


# ── Админ: салбарын CRUD ───────────────────────────────
@router.get("/", response_model=List[BranchOut])
def list_all(db: Session = Depends(central_db),
             _: models.User = Depends(get_current_user)):
    return db.query(Branch).order_by(Branch.sort_order, Branch.id).all()


def _unique_code(db: Session, name: str) -> str:
    base = central.slugify(name)
    code, n = base, 2
    while db.query(Branch).filter(Branch.code == code).first():
        code, n = f"{base}-{n}", n + 1
    return code


@router.post("/", response_model=BranchOut)
def create_branch(payload: BranchCreate,
                  db: Session = Depends(central_db),
                  _: models.User = Depends(require_admin)):
    """Шинэ салбар — өөрийн DB файлтайгаар үүснэ."""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Салбарын нэр хоосон байна")
    if db.query(Branch).filter(Branch.name == name).first():
        raise HTTPException(status_code=400, detail="Ийм нэртэй салбар бүртгэлтэй байна")

    code = _unique_code(db, name)
    branch = Branch(
        code=code, name=name,
        db_file=os.path.join(central.BRANCH_DIR, f"{code}.db"),
        address=(payload.address or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        sort_order=(db.query(Branch).count()),
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)

    # DB-г шууд бэлтгэнэ — хүснэгт, migration, глобал хэрэглэгч, seed
    central.ensure_ready(branch)
    return branch


@router.put("/{branch_id}", response_model=BranchOut)
def update_branch(branch_id: int, payload: BranchUpdate,
                  db: Session = Depends(central_db),
                  _: models.User = Depends(require_admin)):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Салбар олдсонгүй")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Салбарын нэр хоосон байна")
        branch.name = name
    for field in ("address", "phone", "sort_order"):
        val = getattr(payload, field)
        if val is not None:
            setattr(branch, field, val)

    if payload.is_active is not None and payload.is_active != branch.is_active:
        if not payload.is_active:
            others = db.query(Branch).filter(Branch.is_active == True,
                                             Branch.id != branch.id).count()
            if others == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Сүүлийн идэвхтэй салбарыг хаах боломжгүй")
        branch.is_active = payload.is_active

    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}")
def deactivate_branch(branch_id: int,
                      db: Session = Depends(central_db),
                      _: models.User = Depends(require_admin)):
    """Салбарыг ХААНА — өгөгдөл нь DB файлдаа бүтэн үлдэнэ."""
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Салбар олдсонгүй")
    others = db.query(Branch).filter(Branch.is_active == True,
                                     Branch.id != branch.id).count()
    if others == 0:
        raise HTTPException(status_code=400,
                            detail="Сүүлийн идэвхтэй салбарыг хаах боломжгүй")
    branch.is_active = False
    db.commit()
    central.unload(branch.code)     # DB файлыг чөлөөлнө (backup хийх боломжтой)
    return {"message": "Салбар хаагдлаа. Өгөгдөл нь хэвээр хадгалагдана."}


# ── Салбар солих (админ / нягтлан) ─────────────────────
@auth_router.post("/switch-branch", response_model=SwitchResponse)
def switch_branch(payload: SwitchBranch,
                  current_user: models.User = Depends(require_global)):
    """Гарахгүйгээр өөр салбар руу шилжинэ — шинэ токен буцаана."""
    branch = central.get_branch(payload.branch_code)
    if not branch or not branch.is_active:
        raise HTTPException(status_code=404, detail="Салбар олдсонгүй")

    central.ensure_ready(branch)
    _, SL = central.engine_for(branch)
    db = SL()
    try:
        user = db.query(models.User).filter(
            models.User.username == current_user.username,
            models.User.is_active == True,
        ).first()
        if not user:
            raise HTTPException(status_code=403,
                                detail="Энэ салбарт таны бүртгэл олдсонгүй")
        return SwitchResponse(
            access_token=create_access_token(user.id, user.role, branch.code),
            user=UserOut.model_validate(user),
            branch=BranchBrief.model_validate(branch),
        )
    finally:
        db.close()


@auth_router.get("/my-branches", response_model=List[BranchBrief])
def my_branches(request: Request,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(central_db)):
    """Хандах эрхтэй салбарууд. Салбарын дотоод хэрэглэгчид зөвхөн өөрийнх."""
    if current_user.is_global:
        return (db.query(Branch)
                  .filter(Branch.is_active == True)
                  .order_by(Branch.sort_order, Branch.id).all())
    from database import central_branch
    return [central_branch(request)]


# ── Глобал хэрэглэгч (админ, нягтлан) ──────────────────
@users_router.get("/", response_model=List[GlobalUserOut])
def list_global_users(db: Session = Depends(central_db),
                      _: models.User = Depends(require_admin)):
    return db.query(GlobalUser).order_by(GlobalUser.id).all()


@users_router.post("/", response_model=GlobalUserOut)
def create_global_user(payload: GlobalUserCreate,
                       db: Session = Depends(central_db),
                       _: models.User = Depends(require_admin)):
    username = (payload.username or "").strip().lower()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Нэвтрэх нэр, нууц үг шаардлагатай")
    if payload.role not in central.GLOBAL_ROLES:
        raise HTTPException(status_code=400,
                            detail="Эрх нь админ эсвэл нягтлан байна")
    if db.query(GlobalUser).filter(GlobalUser.username == username).first():
        raise HTTPException(status_code=400, detail="Ийм нэвтрэх нэр бүртгэлтэй байна")

    gu = GlobalUser(
        username=username, full_name=(payload.full_name or username).strip(),
        password_hash=hash_password(payload.password), role=payload.role,
    )
    db.add(gu)
    db.commit()
    db.refresh(gu)
    central.sync_all_branches()
    return gu


@users_router.put("/{user_id}", response_model=GlobalUserOut)
def update_global_user(user_id: int, payload: GlobalUserUpdate,
                       db: Session = Depends(central_db),
                       current: models.User = Depends(require_admin)):
    gu = db.query(GlobalUser).filter(GlobalUser.id == user_id).first()
    if not gu:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй")

    if payload.full_name is not None:
        gu.full_name = payload.full_name.strip() or gu.full_name
    if payload.role is not None:
        if payload.role not in central.GLOBAL_ROLES:
            raise HTTPException(status_code=400,
                                detail="Эрх нь админ эсвэл нягтлан байна")
        gu.role = payload.role
    if payload.password:
        gu.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        gu.is_active = payload.is_active

    _guard_last_admin(db, gu, current)
    db.commit()
    db.refresh(gu)
    central.sync_all_branches()
    return gu


@users_router.delete("/{user_id}")
def delete_global_user(user_id: int,
                       db: Session = Depends(central_db),
                       current: models.User = Depends(require_admin)):
    gu = db.query(GlobalUser).filter(GlobalUser.id == user_id).first()
    if not gu:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй")
    if gu.username == current.username:
        raise HTTPException(status_code=400, detail="Өөрийгөө устгах боломжгүй")
    gu.is_active = False           # түр хаах — устгахын өмнө шалгана
    _guard_last_admin(db, gu, current)
    db.delete(gu)
    db.commit()
    central.sync_all_branches()
    return {"message": "Хэрэглэгч устлаа"}


def _guard_last_admin(db: Session, gu: GlobalUser, current: models.User) -> None:
    """Сүүлийн идэвхтэй глобал админыг хасахаас сэргийлнэ."""
    if gu.role == "admin" and gu.is_active:
        return
    left = (db.query(GlobalUser)
              .filter(GlobalUser.role == "admin",
                      GlobalUser.is_active == True,
                      GlobalUser.id != gu.id)
              .count())
    if left == 0:
        raise HTTPException(
            status_code=400,
            detail="Сүүлийн админыг хасах боломжгүй — өөр админ үүсгэнэ үү")
