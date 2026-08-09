from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
from typing import List, Optional

from database import get_db
from models import Customer, Order, OrderItem
from schemas import CustomerCreate, CustomerUpdate, CustomerOut, OrderOut

router = APIRouter(prefix="/customers", tags=["customers"])


def _with_warnings(customers: List[Customer], db: Session) -> List[CustomerOut]:
    """Үйлчлүүлэгч бүрийн анхааруулгатай захиалгын тоо / төлөгдөөгүй дүнг нэмнэ."""
    out = [CustomerOut.model_validate(c) for c in customers]
    ids = [c.id for c in customers]
    if not ids:
        return out

    rows = (
        db.query(
            Order.customer_id,
            func.count(Order.id),
            func.sum(Order.total),
        )
        .filter(
            Order.customer_id.in_(ids),
            Order.is_flagged == True,
            Order.status != "deleted",
            Order.is_paid == False,
        )
        .group_by(Order.customer_id)
        .all()
    )
    stats = {cid: (cnt, total or 0.0) for cid, cnt, total in rows}
    for item in out:
        cnt, total = stats.get(item.id, (0, 0.0))
        item.warning_count = cnt
        item.warning_total = float(total)
    return out


@router.get("/", response_model=List[CustomerOut])
def list_customers(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    rows = db.query(Customer).offset(skip).limit(limit).all()
    return _with_warnings(rows, db)


@router.get("/search", response_model=List[CustomerOut])
def search_customers(phone: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Утас эсвэл нэрээр хайх"""
    rows = db.query(Customer).filter(
        or_(
            Customer.phone.ilike(f"%{phone}%"),
            Customer.name.ilike(f"%{phone}%")
        )
    ).limit(50).all()
    return _with_warnings(rows, db)


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Үйлчлүүлэгч олдсонгүй")
    return _with_warnings([c], db)[0]


@router.post("/", response_model=CustomerOut)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    existing = db.query(Customer).filter(Customer.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Утасны дугаар бүртгэлтэй байна")
    c = Customer(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Үйлчлүүлэгч олдсонгүй")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return _with_warnings([c], db)[0]


@router.get("/{customer_id}/orders", response_model=List[OrderOut])
def customer_orders(customer_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """Үйлчлүүлэгчийн захиалгын түүх"""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Үйлчлүүлэгч олдсонгүй")
    orders = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items).joinedload(OrderItem.service)
        )
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )
    return orders


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Үйлчлүүлэгч устгах (захиалгагүй бол)"""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Үйлчлүүлэгч олдсонгүй")
    order_count = db.query(Order).filter(Order.customer_id == customer_id).count()
    if order_count > 0:
        raise HTTPException(status_code=400, detail=f"Энэ үйлчлүүлэгч {order_count} захиалгатай тул устгах боломжгүй")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/{customer_id}/add-points")
def add_points(customer_id: int, points: int, db: Session = Depends(get_db)):
    """Гараар оноо нэмэх (хасах) - Зөвхөн admin"""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Үйлчлүүлэгч олдсонгүй")
    c.points = max(0, c.points + points)
    db.commit()
    return {"points": c.points}
