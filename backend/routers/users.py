from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from database import get_db
import models
import schemas
from auth import get_current_user, require_admin, hash_password, verify_password, create_access_token

router = APIRouter()


# ── Login ────────────────────────────────────────────────────────────────────
@router.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.username == payload.username,
        models.User.is_active == True,
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Нэвтрэх нэр эсвэл нууц үг буруу байна",
        )
    # Касс эрхтэй бол ээлж шалгах
    if user.role == "cashier":
        active_shift = db.query(models.CashierShift).options(
            joinedload(models.CashierShift.user)
        ).filter(models.CashierShift.status == "active").first()

        if active_shift and active_shift.user_id != user.id:
            raise HTTPException(
                status_code=403,
                detail=f"Касс {active_shift.user.full_name} идэвхтэй ажиллаж байна"
            )

        # Идэвхтэй ээлж байхгүй бол шинээр эхлэх
        if not active_shift:
            new_shift = models.CashierShift(user_id=user.id)
            db.add(new_shift)
            db.commit()

    token = create_access_token(user.id, user.role)
    return schemas.TokenResponse(
        access_token=token,
        user=schemas.UserOut.model_validate(user),
    )


# ── Me ───────────────────────────────────────────────────────────────────────
@router.get("/auth/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ── User CRUD (admin only) ────────────────────────────────────────────────────
@router.get("/users/", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _:  models.User = Depends(require_admin),
):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("/users/", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_admin),
):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(
            status_code=400,
            detail="Энэ нэвтрэх нэр аль хэдийн бүртгэлтэй байна",
        )
    user = models.User(
        username      = payload.username,
        full_name     = payload.full_name,
        password_hash = hash_password(payload.password),
        role          = payload.role,
        is_active     = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db:      Session = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй")
    # prevent admin from downgrading their own role
    if user_id == admin.id and payload.role is not None and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Өөрийнхөө эрхийг өөрчлөх боломжгүй")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: schemas.UserPasswordReset,
    db:      Session = Depends(get_db),
    _:       models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй")
    if len(payload.new_password) < 4:
        raise HTTPException(
            status_code=400,
            detail="Нууц үг хамгийн багадаа 4 тэмдэгтэй байх ёстой",
        )
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Нууц үг амжилттай шинэчлэгдлээ"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db:      Session = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Өөрийн эрхийг устгах боломжгүй")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Хэрэглэгч олдсонгүй")
    db.delete(user)
    db.commit()
    return {"ok": True}
