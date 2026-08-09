from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timezone, timedelta

_LOCAL_TZ = timezone(timedelta(hours=8))
def _now_local():
    return datetime.now(_LOCAL_TZ)
from typing import Optional, List

from database import SessionLocal
import models
import schemas

router = APIRouter(prefix="/machines", tags=["machines"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _machine_out(machine: models.Machine, db: Session) -> dict:
    """Machine-ийг current_usage-тай dict болгоно."""
    current = (
        db.query(models.MachineUsage)
        .filter(
            models.MachineUsage.machine_id == machine.id,
            models.MachineUsage.status == "running",
        )
        .first()
    )
    data = {
        "id": machine.id,
        "name": machine.name,
        "machine_type": machine.machine_type,
        "is_active": machine.is_active,
        "current_usage": current,
    }
    return data


# ── List machines ─────────────────────────────────────────
@router.get("/", response_model=List[schemas.MachineOut])
def list_machines(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Machine)
    if active_only:
        q = q.filter(models.Machine.is_active == True)
    machines = q.order_by(models.Machine.machine_type, models.Machine.id).all()
    return [_machine_out(m, db) for m in machines]


# ── Create machine (admin) ────────────────────────────────
@router.post("/", response_model=schemas.MachineOut)
def create_machine(data: schemas.MachineCreate, db: Session = Depends(get_db)):
    machine = models.Machine(name=data.name, machine_type=data.machine_type.value)
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return _machine_out(machine, db)


# ── Update machine (admin) ────────────────────────────────
@router.put("/{machine_id}", response_model=schemas.MachineOut)
def update_machine(machine_id: int, data: schemas.MachineUpdate, db: Session = Depends(get_db)):
    machine = db.query(models.Machine).get(machine_id)
    if not machine:
        raise HTTPException(404, "Машин олдсонгүй")
    if data.name is not None:
        machine.name = data.name
    if data.machine_type is not None:
        machine.machine_type = data.machine_type.value if hasattr(data.machine_type, 'value') else data.machine_type
    if data.is_active is not None:
        machine.is_active = data.is_active
    db.commit()
    db.refresh(machine)
    return _machine_out(machine, db)


# ── Delete (soft) machine ─────────────────────────────────
@router.delete("/{machine_id}")
def delete_machine(machine_id: int, db: Session = Depends(get_db)):
    machine = db.query(models.Machine).get(machine_id)
    if not machine:
        raise HTTPException(404, "Машин олдсонгүй")
    machine.is_active = False
    db.commit()
    return {"ok": True}


# ── Assign order item to machine ──────────────────────────
@router.post("/{machine_id}/assign", response_model=schemas.MachineOut)
def assign_machine(machine_id: int, data: schemas.AssignMachineRequest, db: Session = Depends(get_db)):
    machine = db.query(models.Machine).get(machine_id)
    if not machine or not machine.is_active:
        raise HTTPException(404, "Машин олдсонгүй")

    # Машин сул эсэх шалгах
    running = (
        db.query(models.MachineUsage)
        .filter(
            models.MachineUsage.machine_id == machine_id,
            models.MachineUsage.status == "running",
        )
        .first()
    )
    if running:
        raise HTTPException(400, "Машин ажиллаж байна")

    # Order, OrderItem олох
    order = db.query(models.Order).get(data.order_id)
    if not order:
        raise HTTPException(404, "Захиалга олдсонгүй")

    order_item = db.query(models.OrderItem).get(data.order_item_id)
    if not order_item or order_item.order_id != data.order_id:
        raise HTTPException(404, "Захиалгын мөр олдсонгүй")

    # Snapshot мэдээлэл
    customer_name = order.customer.name if order.customer else (order.phone or "—")
    service_name = order_item.item_name or "—"

    # sub_index давхцаж байгаа эсэхийг шалгах
    existing = db.query(models.MachineUsage).filter(
        models.MachineUsage.order_item_id == data.order_item_id,
        models.MachineUsage.sub_index == data.sub_index,
        models.MachineUsage.status == "running",
    ).first()
    if existing:
        raise HTTPException(400, "Энэ үйлчилгээ аль хэдийн машинд оруулсан байна")

    usage = models.MachineUsage(
        machine_id=machine_id,
        order_id=data.order_id,
        order_item_id=data.order_item_id,
        sub_index=data.sub_index,
        customer_name=customer_name,
        service_name=service_name,
        duration_min=data.duration_min,
        started_at=_now_local(),
        status="running",
    )
    db.add(usage)
    db.commit()
    db.refresh(machine)
    return _machine_out(machine, db)


# ── Complete machine usage ────────────────────────────────
@router.post("/{machine_id}/complete", response_model=schemas.MachineOut)
def complete_machine(machine_id: int, db: Session = Depends(get_db)):
    machine = db.query(models.Machine).get(machine_id)
    if not machine:
        raise HTTPException(404, "Машин олдсонгүй")

    usage = (
        db.query(models.MachineUsage)
        .filter(
            models.MachineUsage.machine_id == machine_id,
            models.MachineUsage.status == "running",
        )
        .first()
    )
    if not usage:
        raise HTTPException(400, "Ажиллаж буй ашиглалт олдсонгүй")

    usage.status = "completed"
    usage.ended_at = _now_local()
    db.commit()
    db.refresh(machine)
    return _machine_out(machine, db)


# ── Active usages (running + completed for non-delivered orders) ──
@router.get("/active-usages", response_model=List[schemas.MachineUsageOut])
def active_usages(db: Session = Depends(get_db)):
    """Олгоогүй захиалгуудын бүх machine usage (running + completed)."""
    usages = (
        db.query(models.MachineUsage)
        .join(models.Order, models.MachineUsage.order_id == models.Order.id)
        .filter(models.Order.status != "delivered")
        .order_by(models.MachineUsage.started_at.desc())
        .all()
    )
    return usages


@router.get("/usages-by-order/{order_id}", response_model=List[schemas.MachineUsageOut])
def usages_by_order(order_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.MachineUsage)
        .filter(models.MachineUsage.order_id == order_id)
        .order_by(models.MachineUsage.started_at.asc())
        .all()
    )


# ── Daily summary ─────────────────────────────────────────
@router.get("/daily-summary", response_model=List[schemas.DailyMachineSummary])
def daily_summary(
    date_str: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    if date_str:
        target = datetime.strptime(date_str, "%Y-%m-%d").date()
    else:
        target = date.today()

    # Өдрийн эхлэл/төгсгөлийг UTC-ээр тооцох (Монгол UTC+8)
    day_start = datetime.combine(target, datetime.min.time()) - timedelta(hours=8)
    day_end = day_start + timedelta(days=1)

    # Бүх идэвхтэй машинуудыг авах
    machines = db.query(models.Machine).filter(models.Machine.is_active == True).all()

    result = []
    for m in machines:
        usages = (
            db.query(models.MachineUsage)
            .filter(
                models.MachineUsage.machine_id == m.id,
                models.MachineUsage.started_at >= day_start,
                models.MachineUsage.started_at < day_end,
            )
            .all()
        )
        total_services = len(usages)
        total_minutes = sum(u.duration_min for u in usages)
        result.append(
            schemas.DailyMachineSummary(
                machine_id=m.id,
                machine_name=m.name,
                total_services=total_services,
                total_minutes=total_minutes,
            )
        )

    return result


# ── Machine report (date range) ───────────────────────────
@router.get("/report")
def machine_report(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Машинуудын тайлан date range-ээр"""
    if start:
        start_dt = datetime.strptime(start, "%Y-%m-%d") - timedelta(hours=8)
    else:
        start_dt = datetime.combine(date.today(), datetime.min.time()) - timedelta(hours=8)
    if end:
        end_dt = datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1) - timedelta(hours=8)
    else:
        end_dt = start_dt + timedelta(days=1)

    machines = db.query(models.Machine).filter(models.Machine.is_active == True).all()

    result = []
    for m in machines:
        usages = (
            db.query(models.MachineUsage)
            .filter(
                models.MachineUsage.machine_id == m.id,
                models.MachineUsage.started_at >= start_dt,
                models.MachineUsage.started_at < end_dt,
            )
            .all()
        )
        total_services = len(usages)
        total_minutes = sum(u.duration_min for u in usages)
        # Per-usage details
        details = [
            {
                "service_name": u.service_name,
                "customer_name": u.customer_name,
                "duration_min": u.duration_min,
                "started_at": u.started_at.isoformat() if u.started_at else None,
                "ended_at": u.ended_at.isoformat() if u.ended_at else None,
                "status": u.status,
            }
            for u in usages
        ]
        result.append({
            "machine_id": m.id,
            "machine_name": m.name,
            "machine_type": m.machine_type,
            "total_services": total_services,
            "total_minutes": total_minutes,
            "usages": details,
        })

    return result
