from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import json

from database import get_db
from models import CashierShift, Order, OrderItem, User
from schemas import ShiftOut, ShiftSummary, ShiftState
from auth import get_current_user

_LOCAL_TZ = timezone(timedelta(hours=8))
def _now_local():
    return datetime.now(_LOCAL_TZ)

router = APIRouter(prefix="/shifts", tags=["shifts"])


# ── Кассын төрөл (ажлын хүрээ) ────────────────────────────
SCOPE_LABEL = {
    "laundry": "Угаалга",
    "shower":  "Шүршүүр",
    "master":  "Бүх касс",
}


def _scope_of(user: User) -> str:
    """Кассчны ажлын хүрээ. Админ/үйлчлэгч бүгдийг хамарна."""
    if user.role == "cashier":
        return user.cashier_scope or "master"
    return "master"


def _conflicts(a: str, b: str) -> bool:
    """Хоёр ажлын хүрээ огтлолцож байвал ЗЭРЭГ ээлж нээгдэхгүй.

    · laundry ↔ laundry, shower ↔ shower  — ижил төрөл дээр нэг л касс
    · master нь хоёуланг хамарна тул бүх төрөлтэй мөргөлдөнө
    · laundry ↔ shower — өөр төрөл тул зэрэг ажиллаж БОЛНО
    """
    return a == b or a == "master" or b == "master"


def _active_shifts(db: Session) -> List[CashierShift]:
    return (
        db.query(CashierShift)
        .options(joinedload(CashierShift.user))
        .filter(CashierShift.status == "active")
        .all()
    )


def _my_active(db: Session, user_id: int) -> Optional[CashierShift]:
    return (
        db.query(CashierShift)
        .options(joinedload(CashierShift.user))
        .filter(CashierShift.user_id == user_id, CashierShift.status == "active")
        .first()
    )


def _blocking_shift(db: Session, user: User) -> Optional[CashierShift]:
    """Энэ хэрэглэгчийг ажиллуулахгүй байгаа ӨӨР кассын идэвхтэй ээлж."""
    scope = _scope_of(user)
    for s in _active_shifts(db):
        if s.user_id != user.id and _conflicts(scope, s.scope or "master"):
            return s
    return None


def _calc_summary(shift: CashierShift, db: Session) -> dict:
    """Ээлжийн хугацаанд үүсгэсэн захиалгуудын тооцоо"""
    orders = db.query(Order).filter(
        Order.cashier_id == shift.user_id,
        Order.created_at >= shift.started_at,
        Order.status != "deleted"
    ).all()

    if shift.ended_at:
        orders = [o for o in orders if o.created_at <= shift.ended_at]

    # Нөхөж авсан төлбөр — өмнө үүссэн захиалгын мөнгийг энэ ээлж дээр авсан.
    # Захиалгын тоонд ордоггүй ч кассын мөнгөнд орох тул тусад нь тооцно.
    late_q = db.query(Order).filter(
        Order.paid_by_id == shift.user_id,
        Order.is_paid == True,
        Order.paid_at.isnot(None),
        Order.paid_at >= shift.started_at,
        Order.created_at < shift.started_at,
        Order.status != "deleted",
    )
    late_orders = late_q.all()
    if shift.ended_at:
        late_orders = [o for o in late_orders if o.paid_at <= shift.ended_at]
    late_total = sum(o.total for o in late_orders)

    cash_total = 0.0
    transfer_total = 0.0
    card_total = 0.0
    unpaid_total = 0.0

    for o in orders + late_orders:
        if not o.is_paid:
            unpaid_total += o.total
            continue
        if o.payment_method == 'mixed' and o.payment_details:
            try:
                for method, amount in json.loads(o.payment_details).items():
                    if method == 'cash':
                        cash_total += float(amount)
                    elif method == 'transfer':
                        transfer_total += float(amount)
                    elif method == 'card':
                        card_total += float(amount)
            except:
                pass
        elif o.payment_method == 'cash':
            cash_total += o.total
        elif o.payment_method == 'transfer':
            transfer_total += o.total
        elif o.payment_method == 'card':
            card_total += o.total

    customer_ids = set(o.customer_id for o in orders if o.customer_id)
    phone_set = set(o.phone for o in orders if o.phone and not o.customer_id)

    # ── Задаргаа ──────────────────────────────────────────
    # Оноо, хямдрал нь мөнгө болж кассд ОРОХГҮЙ тул нийт дүнд ордоггүй.
    # Гэхдээ тулгалт хийхэд хэрэгтэй тул тусад нь харуулна.
    points_total   = float(sum(o.points_used     or 0 for o in orders))
    discount_total = float(sum(o.discount_amount or 0 for o in orders))
    vat_total      = float(sum(o.vat_amount      or 0 for o in orders))

    # Үйлчилгээний төрлөөр (мөрийн дүнгээр — холимог захиалга хуваагдана)
    order_ids = [o.id for o in orders]
    shower_total = laundry_total = product_total = 0.0
    if order_ids:
        rows = (
            db.query(OrderItem.item_type, func.sum(OrderItem.total_price))
            .filter(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.item_type)
            .all()
        )
        for item_type, amount in rows:
            amount = float(amount or 0)
            if item_type == "room":
                shower_total += amount
            elif item_type == "product":
                product_total += amount
            else:
                laundry_total += amount

    return {
        "total_orders": len(orders),
        "total_customers": len(customer_ids) + len(phone_set),
        # total_revenue = бодитоор орсон мөнгө (кассын тулгалт). Төлөгдөөгүй нь тусдаа мөр.
        "total_revenue": cash_total + transfer_total + card_total,
        "cash_total": cash_total,
        "transfer_total": transfer_total,
        "card_total": card_total,
        "unpaid_total": unpaid_total,
        "late_total": late_total,
        "points_total": points_total,
        "discount_total": discount_total,
        "vat_total": vat_total,
        "shower_total": shower_total,
        "laundry_total": laundry_total,
        "product_total": product_total,
    }


@router.get("/active", response_model=Optional[ShiftOut])
def get_active_shift(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Өөрийн идэвхтэй ээлж (байхгүй бол null)"""
    return _my_active(db, current_user.id)


@router.get("/my", response_model=ShiftState)
def my_shift_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """POS-ыг нээх эсэхийг шийддэг төлөв.

    · requires_shift=False → ээлж шаардахгүй (админ, үйлчлэгч)
    · shift байвал         → ажиллаж болно
    · blocked_by байвал    → өөр касс ажиллаж байна, ажиллах боломжгүй
    · хоёулаа null         → «Ээлж эхлүүлэх» дарж эхэлнэ
    """
    scope = _scope_of(current_user)
    mine  = _my_active(db, current_user.id)
    return ShiftState(
        requires_shift = current_user.role == "cashier",
        scope          = scope,
        scope_label    = SCOPE_LABEL.get(scope, scope),
        shift          = mine,
        blocked_by     = None if mine else _blocking_shift(db, current_user),
    )


@router.post("/start", response_model=ShiftOut)
def start_shift(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ээлж эхлэх"""
    if current_user.role != "cashier":
        raise HTTPException(status_code=400, detail="Зөвхөн кассчин ээлж нээнэ")

    mine = _my_active(db, current_user.id)
    if mine:
        return mine  # Өөрийн ээлж байвал шууд буцаана

    scope = _scope_of(current_user)
    blocker = _blocking_shift(db, current_user)
    if blocker:
        raise HTTPException(
            status_code=409,
            detail=(
                f"«{SCOPE_LABEL.get(blocker.scope or 'master', blocker.scope)}» кассын "
                f"ээлж нээлттэй байна — {blocker.user.full_name}. "
                f"Тэр ээлжийг хаасны дараа эхлүүлнэ үү."
            )
        )

    shift = CashierShift(user_id=current_user.id, scope=scope)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return db.query(CashierShift).options(
        joinedload(CashierShift.user)
    ).filter(CashierShift.id == shift.id).first()


@router.post("/end", response_model=ShiftSummary)
def end_shift(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ээлж дуусгах"""
    shift = _my_active(db, current_user.id)
    if not shift:
        raise HTTPException(status_code=404, detail="Идэвхтэй ээлж олдсонгүй")

    # Төлөгдөөгүй захиалга шалгах.
    # Анхааруулгын жагсаалтад оруулсан захиалгыг оруулж тооцохгүй — кассчин
    # «төлбөргүй явсан» гэдгийг аль хэдийн бүртгэсэн тул ээлж хаахад саад болохгүй.
    unpaid_count = db.query(Order).filter(
        Order.cashier_id == current_user.id,
        Order.created_at >= shift.started_at,
        Order.is_paid == False,
        Order.status.notin_(["deleted", "archived"]),
        or_(Order.is_flagged.is_(None), Order.is_flagged == False),
    ).count()
    if unpaid_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Төлөгдөөгүй {unpaid_count} захиалга байна. Төлбөр авах эсвэл "
                f"«Төлбөргүй явсан» гэж анхааруулгад нэмнэ үү."
            )
        )

    shift.ended_at = _now_local()
    shift.status = "ended"
    db.commit()
    db.refresh(shift)

    summary = _calc_summary(shift, db)
    shift_out = db.query(CashierShift).options(
        joinedload(CashierShift.user)
    ).filter(CashierShift.id == shift.id).first()

    return ShiftSummary(shift=shift_out, **summary)


@router.get("/history")
def shift_history(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    scope: Optional[str] = None,          # laundry | shower | master
    include_active: bool = False,
    db: Session = Depends(get_db)
):
    """Ээлжийн түүх (admin)"""
    q = db.query(CashierShift).options(joinedload(CashierShift.user))
    if not include_active:
        q = q.filter(CashierShift.status == "ended")

    if date_from:
        q = q.filter(func.date(CashierShift.started_at) >= date_from)
    if date_to:
        q = q.filter(func.date(CashierShift.started_at) <= date_to)
    if scope:
        q = q.filter(CashierShift.scope == scope)

    shifts = q.order_by(CashierShift.started_at.desc()).limit(100).all()
    results = []
    for s in shifts:
        summary = _calc_summary(s, db)
        results.append({"shift": s, **summary})
    return results


@router.get("/{shift_id}/summary", response_model=ShiftSummary)
def get_shift_summary(shift_id: int, db: Session = Depends(get_db)):
    shift = db.query(CashierShift).options(
        joinedload(CashierShift.user)
    ).filter(CashierShift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Ээлж олдсонгүй")
    summary = _calc_summary(shift, db)
    return ShiftSummary(shift=shift, **summary)
