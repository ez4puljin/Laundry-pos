from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import InventoryItem, ProductCategory
from schemas import (
    InventoryCreate, InventoryUpdate, InventoryOut,
    ProductCategoryCreate, ProductCategoryUpdate, ProductCategoryOut,
)
from auth import get_current_user, require_admin


class StockAdjust(BaseModel):
    quantity: float       # нэмэх тоо хэмжээ (+ орлого, - зарлага)
    note: str = ""        # тайлбар

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Барааны ангилал — үйлчилгээний /categories-аас ТУСДАА
categories_router = APIRouter(prefix="/product-categories", tags=["inventory"])


@categories_router.get("/", response_model=List[ProductCategoryOut])
def list_product_categories(
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    q = db.query(ProductCategory)
    if active_only:
        q = q.filter(ProductCategory.is_active == True)
    return q.order_by(ProductCategory.sort_order, ProductCategory.id).all()


@categories_router.post("/", response_model=ProductCategoryOut)
def create_product_category(
    payload: ProductCategoryCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    cat = ProductCategory(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@categories_router.put("/{cat_id}", response_model=ProductCategoryOut)
def update_product_category(
    cat_id: int,
    payload: ProductCategoryUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    cat = db.query(ProductCategory).get(cat_id)
    if not cat:
        raise HTTPException(404, "Ангилал олдсонгүй")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat


@categories_router.delete("/{cat_id}")
def delete_product_category(
    cat_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    cat = db.query(ProductCategory).get(cat_id)
    if not cat:
        raise HTTPException(404, "Ангилал олдсонгүй")
    # Зөөлөн устгал — энэ ангилалтай барааны холбоос тасрахгүй
    cat.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/", response_model=List[InventoryOut])
def list_inventory(
    for_sale: Optional[bool] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),   # ямар ч нэвтэрсэн хэрэглэгч харж болно
):
    q = db.query(InventoryItem)
    if for_sale is not None:
        q = q.filter(InventoryItem.is_for_sale == for_sale)
    if category_id is not None:
        q = q.filter(InventoryItem.category_id == category_id)
    items = q.order_by(InventoryItem.name).all()
    result = []
    for i in items:
        out = InventoryOut.model_validate(i)
        out.is_low = i.quantity <= i.min_quantity
        result.append(out)
    return result


@router.post("/", response_model=InventoryOut)
def create_item(
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    out = InventoryOut.model_validate(item)
    out.is_low = item.quantity <= item.min_quantity
    return out


@router.post("/{item_id}/adjust", response_model=InventoryOut)
def adjust_stock(
    item_id: int,
    payload: StockAdjust,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    """Бараа материалын үлдэгдэл нэмэх/хасах"""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Бараа олдсонгүй")
    item.quantity = max(0, item.quantity + payload.quantity)
    db.commit()
    db.refresh(item)
    out = InventoryOut.model_validate(item)
    out.is_low = item.quantity <= item.min_quantity
    return out


@router.patch("/{item_id}", response_model=InventoryOut)
def update_item(
    item_id: int,
    payload: InventoryUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Бараа олдсонгүй")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    out = InventoryOut.model_validate(item)
    out.is_low = item.quantity <= item.min_quantity
    return out


@router.delete("/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_admin),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Бараа олдсонгүй")
    db.delete(item)
    db.commit()
    return {"ok": True}
