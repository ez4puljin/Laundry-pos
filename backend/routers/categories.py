from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Category, Service
from schemas import CategoryCreate, CategoryUpdate, CategoryOut
from auth import get_current_user, require_bookkeeping

router = APIRouter(prefix="/categories", tags=["categories"])


# GET — бүх нэвтэрсэн хэрэглэгч (касс + админ)
@router.get("/", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Category).order_by(Category.sort_order, Category.id).all()


# POST/PUT/DELETE — зөвхөн админ
@router.post("/", response_model=CategoryOut)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), _=Depends(require_bookkeeping)):
    existing = db.query(Category).filter(Category.value == payload.value).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ангилалын утга давхцаж байна")
    cat = Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), _=Depends(require_bookkeeping)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Ангилал олдсонгүй")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), _=Depends(require_bookkeeping)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Ангилал олдсонгүй")
    in_use = db.query(Service).filter(Service.category == cat.value).count()
    if in_use > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Энэ ангилалд {in_use} үйлчилгээ байна. Эхлээд үйлчилгээг шилжүүлнэ үү."
        )
    db.delete(cat)
    db.commit()
    return {"ok": True}
