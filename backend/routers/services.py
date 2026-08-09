from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import Service, Machine
from schemas import ServiceCreate, ServiceUpdate, ServiceOut

router = APIRouter(prefix="/services", tags=["services"])


@router.get("/", response_model=List[ServiceOut])
def list_services(
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Бүх үйлчилгээний жагсаалт"""
    q = db.query(Service)
    if active_only:
        q = q.filter(Service.is_active == True)
    if category:
        q = q.filter(Service.category == category)
    return q.order_by(Service.category, Service.name).all()


@router.get("/search", response_model=List[ServiceOut])
def search_services(q: str, db: Session = Depends(get_db)):
    """Нэр эсвэл кодоор хайх"""
    keyword = f"%{q}%"
    return db.query(Service).filter(
        Service.is_active == True,
        (Service.name.ilike(keyword)) | (Service.code.ilike(keyword))
    ).limit(20).all()


@router.get("/{service_id}", response_model=ServiceOut)
def get_service(service_id: int, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Үйлчилгээ олдсонгүй")
    return svc


@router.post("/", response_model=ServiceOut)
def create_service(payload: ServiceCreate, db: Session = Depends(get_db)):
    """Шинэ үйлчилгээ нэмэх"""
    existing = db.query(Service).filter(Service.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Код давхцаж байна")
    data = payload.model_dump(exclude={"machine_ids"})
    svc = Service(**data)
    if payload.machine_ids:
        svc.machines = db.query(Machine).filter(Machine.id.in_(payload.machine_ids)).all()
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return svc


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, payload: ServiceUpdate, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Үйлчилгээ олдсонгүй")
    updates = payload.model_dump(exclude_unset=True)
    machine_ids = updates.pop("machine_ids", None)
    for field, value in updates.items():
        setattr(svc, field, value)
    if machine_ids is not None:
        svc.machines = db.query(Machine).filter(Machine.id.in_(machine_ids)).all() if machine_ids else []
    db.commit()
    db.refresh(svc)
    return svc


@router.delete("/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Үйлчилгээ олдсонгүй")
    svc.is_active = False   # soft delete
    db.commit()
    return {"ok": True}
