import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func, case
from typing import List, Optional
from datetime import datetime, date, timezone, timedelta

# Монгол цагийн бүс (UTC+8)
_LOCAL_TZ = timezone(timedelta(hours=8))

def _now_local():
    return datetime.now(_LOCAL_TZ)

from database import get_db
from models import (
    CashierShift,
    Order, OrderItem, Service, Customer, Coupon, InventoryItem,
    RoomSession, ShowerTariff, order_kind_condition,
    SESSION_ACTIVE_STATUSES,
)
from schemas import (
    OrderCreate, OrderItemCreate, OrderOut, OrderStatusUpdate, OrderPayRequest,
    OrderFlagRequest, CouponValidate, CouponOut, CouponCreate
)
import settings_store
import json
from sms_service import send_ready_sms
from auth import get_current_user, require_admin

router = APIRouter(prefix="/orders", tags=["orders"])


def _generate_order_number(db: Session) -> str:
    from sqlalchemy import func as sa_func
    today = date.today().strftime("%Y%m%d")
    prefix = f"LAU-{today}-"
    last = db.query(sa_func.max(Order.order_number)).filter(
        Order.order_number.like(f"{prefix}%")
    ).scalar()
    if last:
        seq = int(last.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:03d}"


def _calc_discount(subtotal: float, dtype: Optional[str], dvalue: float) -> float:
    if not dtype or not dvalue:
        return 0.0
    if dtype == "percent":
        return round(subtotal * dvalue / 100, 0)
    return min(dvalue, subtotal)


# ── НӨАТ ────────────────────────────────────────────────
#  ХОЛИМОГ загвар:
#
#  * Үйлчилгээ ба шүршүүр — үнэ нь НӨАТ БАГТСАН. 5000₮ тарифтай бол
#    үйлчлүүлэгч 5000₮ л төлнө; баримт дээр 455₮ нь НӨАТ гэж задарна.
#
#  * Бараа материал — үнэ нь НӨАТ-ГҮЙ (цэвэр) дүн. Кассчин «НӨАТ-тэй
#    авах» гэж сонговол үнэ дээр +10% НЭМЭГДЭНЭ: 500₮ → 550₮ болж,
#    нийт төлөх дүн ч мөн өснө. Сонгоогүй бол 500₮ хэвээр, НӨАТ гарахгүй.
#
#  Нэмэгдсэний дараа барааны үнэ ч НӨАТ багтсан болох тул НӨАТ-ийн
#  задаргаа бүх мөрөнд нэг ижил томьёогоор бодогдоно (дүн/11).
VAT_RATE = float(os.getenv("VAT_RATE", "0.10"))


def _apply_product_vat(item_rows, product_vat: bool) -> None:
    """«НӨАТ-тэй авах» сонгосон үед барааны мөрийн үнийг +10% болгоно.

    Мөрийг ГАЗАР ДЭЭР нь өөрчилдөг тул баримт дээр нэгж үнэ өссөнөөр
    харагдана (500₮ → 550₮). Үйлчилгээ/шүршүүрт хамаагүй.
    """
    if not product_vat:
        return
    for r in item_rows:
        if r.item_type == "product":
            r.unit_price  = round(r.unit_price * (1 + VAT_RATE))
            r.total_price = r.unit_price * r.quantity

# НӨАТ үргэлж ногдох мөрийн төрлүүд (үйлчилгээ ба шүршүүр)
_VAT_ALWAYS_TYPES = ("service", "room")


def _calc_vat(item_rows, product_vat: bool) -> float:
    """НӨАТ-тэй мөрүүдийн дүнд багтсан НӨАТ-ийг задалж бодох.

    ЧУХАЛ: барааны үнэ аль хэдийн _apply_product_vat-аар нэмэгдсэн байх
    ёстой — тэгснээр бүх НӨАТ-тэй мөр «НӨАТ багтсан» болж, нэг ижил
    томьёо (дүн/11) хэрэглэгдэнэ.

    Үйлчилгээ болон шүршүүр үргэлж НӨАТ-тэй. Бараа материал зөвхөн
    кассчин «НӨАТ-тэй авах» сонголтыг чеклэсэн үед.
    """
    base = sum(
        r.total_price for r in item_rows
        if r.item_type in _VAT_ALWAYS_TYPES
        or (product_vat and r.item_type == "product")
    )
    return round(base * VAT_RATE / (1 + VAT_RATE), 0)


# Кассчин хэдэн өдрийн түүх харах эрхтэй вэ (өнөөдөр + өчигдөр)
CASHIER_HISTORY_DAYS = 1


def _clamp_history_range(date_from: Optional[str], date_to: Optional[str], user) -> tuple:
    """Кассчин зөвхөн өнөөдөр болон өчигдрийн захиалгыг харна."""
    if user.role == "admin":
        return date_from, date_to
    today = _now_local().date()
    min_date = (today - timedelta(days=CASHIER_HISTORY_DAYS)).isoformat()
    max_date = today.isoformat()
    if not date_from or date_from < min_date:
        date_from = min_date
    if not date_to or date_to > max_date:
        date_to = max_date
    return date_from, date_to


# Түүх хуудасны нэг хуудсанд буух захиалгын тоо. Хязгааргүй татвал
# жилийн 22,000 захиалга ~4 секунд болж хөтчийг гацаадаг байсан.
HISTORY_PAGE_SIZE = 100
HISTORY_MAX_LIMIT = 500


def _history_filters(q, *, status, kind, payment_method, date_from, date_to):
    """Түүхийн шүүлтүүр — жагсаалт ба нийлбэр ижил нөхцөлөөр ажиллана."""
    if status:
        q = q.filter(Order.status == status)
    else:
        q = q.filter(Order.status != "deleted")
    if payment_method:
        # «unpaid» нь тусдаа арга биш, төлөгдөөгүй байдал — тиймээс
        # is_paid-аар шүүнэ. Бусад нь бодит төлбөрийн хэлбэр.
        if payment_method == "unpaid":
            q = q.filter(Order.is_paid == False)
        else:
            q = q.filter(Order.is_paid == True,
                         Order.payment_method == payment_method)
    kind_cond = order_kind_condition(kind)
    if kind_cond is not None:
        q = q.filter(kind_cond)
    if date_from:
        q = q.filter(Order.created_at >= date_from)
    if date_to:
        q = q.filter(Order.created_at <= date_to + " 23:59:59")
    return q


@router.get("/", response_model=List[OrderOut])
def list_orders(
    status: Optional[str] = None,
    kind: Optional[str] = None,          # laundry | shower (хоосон = бүгд)
    payment_method: Optional[str] = None,  # cash|transfer|card|mixed|points|unpaid
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Захиалгын жагсаалт — ҮРГЭЛЖ хуудаслана.

    Нийт дүнг эндээс бодохгүй: `/orders/summary` нь SQL дээр бүх хугацааны
    нийлбэрийг шууд гаргадаг тул хязгааргүй татах шаардлагагүй.
    """
    date_from, date_to = _clamp_history_range(date_from, date_to, current_user)

    q = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.sessions),      # түүх дээр оочирын № харуулна
    )
    q = _history_filters(q, status=status, kind=kind, payment_method=payment_method,
                         date_from=date_from, date_to=date_to)
    q = q.order_by(Order.created_at.desc())

    take = HISTORY_PAGE_SIZE if limit is None else max(1, min(limit, HISTORY_MAX_LIMIT))
    if skip:
        q = q.offset(skip)
    return q.limit(take).all()


@router.get("/summary")
def history_summary(
    kind: Optional[str] = None,
    payment_method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Түүх хуудасны нийлбэрүүд — бүгд SQL дээр бодогдоно.

    Хэдэн мянган захиалгатай ч хэдхэн миллисекунд, учир нь мөрүүдийг
    хөтөч рүү татахгүй.
    """
    date_from, date_to = _clamp_history_range(date_from, date_to, current_user)
    F = dict(kind=kind, payment_method=payment_method,
             date_from=date_from, date_to=date_to)

    def agg(status):
        row = _history_filters(
            db.query(func.count(Order.id),
                     func.coalesce(func.sum(Order.total), 0.0),
                     func.coalesce(func.sum(Order.discount_amount), 0.0)),
            status=status, **F).one()
        return {"count": row[0], "total": float(row[1]), "discount": float(row[2])}

    active  = agg(None)
    deleted = agg("deleted")

    unpaid_total = float(_history_filters(
        db.query(func.coalesce(func.sum(Order.total), 0.0)), status=None, **F
    ).filter(Order.is_paid == False).scalar() or 0.0)

    # ── Төлбөрийн хэлбэрийн задаргаа ──────────────────────
    breakdown: dict = {}
    rows = _history_filters(
        db.query(Order.payment_method, func.coalesce(func.sum(Order.total), 0.0)),
        status=None, **F
    ).filter(Order.is_paid == True).group_by(Order.payment_method).all()
    for method, amount in rows:
        if method != "mixed":
            breakdown[method] = breakdown.get(method, 0.0) + float(amount or 0)
    if unpaid_total:
        breakdown["unpaid"] = unpaid_total

    # Холимог төлбөрийг задлахад JSON уншина — ийм захиалга цөөн тул
    # зөвхөн ТЭДГЭЭР мөрийг татна.
    mixed = _history_filters(
        db.query(Order.payment_details), status=None, **F
    ).filter(Order.is_paid == True, Order.payment_method == "mixed").all()
    for (details,) in mixed:
        if not details:
            continue
        try:
            for m, a in json.loads(details).items():
                breakdown[m] = breakdown.get(m, 0.0) + float(a)
        except (ValueError, TypeError):
            pass

    # ── Нөхөж авсан төлбөр ────────────────────────────────
    late_q = db.query(func.count(Order.id),
                      func.coalesce(func.sum(Order.total), 0.0)).filter(
        Order.is_paid == True,
        Order.paid_at.isnot(None),
        Order.status != "deleted",
        func.date(Order.paid_at) != func.date(Order.created_at),
    )
    if date_from:
        late_q = late_q.filter(Order.paid_at >= date_from)
    if date_to:
        late_q = late_q.filter(Order.paid_at <= date_to + " 23:59:59")
    late_count, late_total = late_q.one()

    return {
        "active_count":   active["count"],
        "active_total":   active["total"],
        "discount_total": active["discount"],
        "unpaid_total":   unpaid_total,
        "deleted_count":  deleted["count"],
        "deleted_total":  deleted["total"],
        "late_count":     late_count,
        "late_total":     float(late_total or 0.0),
        "breakdown":      breakdown,
        "page_size":      HISTORY_PAGE_SIZE,
    }


@router.get("/queue", response_model=List[OrderOut])
def get_queue(db: Session = Depends(get_db)):
    """Дараалалд байгаа захиалгууд + өнөөдөр олгосон

    Анхааруулгын жагсаалтад орсон захиалга ч дараалалд хэвээр үлдэж, бэлэн болсон /
    олгосон төлөв рүү шилжинэ. Зөвхөн төлбөрийн байдал нь тусад нь тэмдэглэгдэнэ.

    Шүршүүрийн захиалга энд харагдахгүй — өрөөний дараалал болон төлөв нь
    Шүршүүр цэсэн дээр тусдаа удирдагдана.
    """
    today_start = _now_local().replace(hour=0, minute=0, second=0, microsecond=0)
    # Угаалгын АЖИЛГҮЙ захиалгуудыг хасна: шүршүүрийн тасалбар болон бараа
    # материал кассан дээр шууд гардаг тул дараалалд хүлээх зүйл байхгүй.
    # (Зөвхөн 'service' мөр л угаалгын процесс шаарддаг.)
    no_laundry_work = (
        db.query(OrderItem.order_id)
        .group_by(OrderItem.order_id)
        .having(func.sum(case((OrderItem.item_type == "service", 1), else_=0)) == 0)
    )
    return (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items).joinedload(OrderItem.service),
            joinedload(Order.items).joinedload(OrderItem.product)
        )
        .filter(
            Order.status.notin_(["archived", "deleted"]),
            Order.id.notin_(no_laundry_work),
            or_(
                Order.status != "delivered",
                and_(Order.status == "delivered", Order.delivered_at >= today_start)
            )
        )
        .order_by(Order.created_at.asc())
        .all()
    )


# ── Анхааруулгатай захиалга (төлбөр төлөлгүй явсан) ─────
# ⚠️ Эдгээр route нь /{order_id}-аас ӨМНӨ бүртгэгдэх ёстой.
@router.get("/flagged", response_model=List[OrderOut])
def list_flagged_orders(
    customer_id: Optional[int] = None,
    date_from: Optional[str] = None,     # анхааруулгад орсон огноогоор (flagged_at)
    date_to: Optional[str] = None,
    created_from: Optional[str] = None,  # захиалга үүссэн огноогоор (created_at)
    created_to: Optional[str] = None,
    cashier_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Анхааруулгын жагсаалтад байгаа захиалгууд.

    Шүүлтүүр заагаагүй бол бүх анхааруулгатай захиалгыг буцаана
    (POS дээр харилцагчийн өрийг шалгахад огноогоор хязгаарлагдах ёсгүй).
    """
    q = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(
        Order.is_flagged == True,
        Order.status != "deleted",
    )
    if customer_id is not None:
        q = q.filter(Order.customer_id == customer_id)
    if date_from:
        q = q.filter(Order.flagged_at >= date_from)
    if date_to:
        q = q.filter(Order.flagged_at <= date_to + " 23:59:59")
    if created_from:
        q = q.filter(Order.created_at >= created_from)
    if created_to:
        q = q.filter(Order.created_at <= created_to + " 23:59:59")
    if cashier_name:
        q = q.filter(Order.cashier_name == cashier_name)
    return q.order_by(Order.flagged_at.desc(), Order.created_at.desc()).all()


@router.get("/late-payments", response_model=List[OrderOut])
def list_late_payments(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Нөхөж авсан төлбөр — өмнөх өдрийн захиалгын төлбөрийг энэ хугацаанд авсан.

    Захиалга нь өөр өдөр үүссэн тул тухайн өдрийн захиалгын тоонд ордоггүй ч
    мөнгө нь тухайн өдрийн орлогод тооцогдоно.
    """
    date_from, date_to = _clamp_history_range(date_from, date_to, current_user)

    q = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(
        Order.is_paid == True,
        Order.paid_at.isnot(None),
        Order.status != "deleted",
        func.date(Order.paid_at) != func.date(Order.created_at),   # нөхөж төлсөн
    )
    if date_from:
        q = q.filter(Order.paid_at >= date_from)
    if date_to:
        q = q.filter(Order.paid_at <= date_to + " 23:59:59")
    return q.order_by(Order.paid_at.desc()).all()


@router.post("/{order_id}/flag", response_model=OrderOut)
def flag_order(
    order_id: int,
    payload: OrderFlagRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Төлбөр төлөлгүй явсан захиалгыг анхааруулгын жагсаалтад нэмэх"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    if o.status == "deleted":
        raise HTTPException(status_code=400, detail="Устгагдсан захиалгыг нэмэх боломжгүй")
    if o.is_paid:
        raise HTTPException(status_code=400, detail="Төлбөр төлөгдсөн захиалгыг анхааруулгад нэмэх шаардлагагүй")
    if o.is_flagged:
        raise HTTPException(status_code=400, detail="Аль хэдийн анхааруулгын жагсаалтад байна")

    o.is_flagged     = True
    o.flagged_at     = _now_local()
    o.flagged_reason = (payload.reason or "").strip() or None
    o.flagged_by     = current_user.full_name
    db.commit()

    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()


@router.delete("/{order_id}/flag", response_model=OrderOut)
def unflag_order(
    order_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_admin),
):
    """Анхааруулгын жагсаалтаас хасах — зөвхөн админ"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    if not o.is_flagged:
        raise HTTPException(status_code=400, detail="Энэ захиалга анхааруулгын жагсаалтад байхгүй")

    o.is_flagged     = False
    o.flagged_at     = None
    o.flagged_reason = None
    o.flagged_by     = None
    db.commit()

    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    o = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.sessions),      # тасалбар дахин хэвлэхэд
    ).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    return o


def _require_open_shift(user, db: Session) -> None:
    """Кассчны идэвхтэй ээлж байгаа эсэхийг шалгана (админд хамаарахгүй)."""
    if getattr(user, "role", None) != "cashier":
        return
    shift = db.query(CashierShift).filter(
        CashierShift.user_id == user.id,
        CashierShift.status == "active",
    ).first()
    if not shift:
        raise HTTPException(
            status_code=409,
            detail="Ээлж нээгдээгүй байна. «Ээлж эхлүүлэх» дарж эхэлнэ үү."
        )


@router.post("/", response_model=OrderOut)
def create_order(payload: OrderCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Шинэ захиалга үүсгэх (POS core)"""
    if not payload.items:
        raise HTTPException(status_code=400, detail="Хоосон захиалга болохгүй")

    # Кассчин зөвхөн НЭЭЛТТЭЙ ээлж дээрээ ажиллана — тулгалт зөрөхөөс сэргийлнэ.
    # (UI нь ээлжгүй үед POS-ыг хаадаг; энэ нь серверийн талын баталгаа.)
    _require_open_shift(current_user, db)

    # Шүршүүрийг зөвхөн урьдчилж төлсөн үед л зарна
    has_shower = any(i.tariff_id for i in payload.items)
    # Угаалгын АЖИЛГҮЙ захиалга (шүршүүрийн тасалбар ба/эсвэл бараа) — шууд
    # дууссанд тооцно: хоёулаа кассан дээр шууд гардаг, дараалалд хүлээхгүй.
    # (Өрөөний амьдралын мөчлөгийг RoomSession тусад нь хөтөлнө.) Ингэснээр
    # борлуулалт нь Түүх болон Тайланд шууд тусна.
    no_laundry_work = not any(i.service_id for i in payload.items)
    if has_shower and payload.payment_method.value == "unpaid":
        raise HTTPException(
            status_code=400,
            detail="Шүршүүрийн захиалгад «Дараа төлөх» боломжгүй. Төлбөрөө эхэлж төлнө үү."
        )

    # 1. Subtotal тооцоолох
    subtotal = 0.0
    item_rows = []
    pending_sessions = []   # (item_rows индекс, тариф, тоо ширхэг)
    for item in payload.items:
        if not item.service_id and not item.product_id and not item.tariff_id:
            raise HTTPException(
                status_code=400,
                detail="service_id, product_id эсвэл tariff_id заавал байх ёстой"
            )

        if item.tariff_id:
            # ── Шүршүүр: хүний төрлийн тасалбар ─────────────
            #  Өрөө ЭНД сонгогдохгүй — хүн бүр дараалалд орж, дараа нь
            #  үйлчлэгч тэднийг өрөөнүүдэд чөлөөтэй хуваарилна.
            tariff = db.query(ShowerTariff).filter(
                ShowerTariff.id == item.tariff_id, ShowerTariff.is_active == True
            ).first()
            if not tariff:
                raise HTTPException(status_code=404, detail="Шүршүүрийн тариф олдсонгүй")
            qty = max(1, item.quantity)
            line_total = tariff.price * qty
            subtotal += line_total
            pending_sessions.append((len(item_rows), tariff, qty))
            item_rows.append(OrderItem(
                item_type   = "room",
                item_name   = f"Шүршүүр — {tariff.name}",
                quantity    = qty,
                unit_price  = tariff.price,
                total_price = line_total,
                notes       = item.notes
            ))
        elif item.service_id:
            # ── Үйлчилгээ ──────────────────────────────────
            svc = db.query(Service).filter(
                Service.id == item.service_id, Service.is_active == True
            ).first()
            if not svc:
                raise HTTPException(status_code=404, detail=f"Үйлчилгээ {item.service_id} олдсонгүй")
            line_total = svc.price * item.quantity
            subtotal += line_total
            item_rows.append(OrderItem(
                service_id  = svc.id,
                item_type   = "service",
                item_name   = svc.name,
                quantity    = item.quantity,
                unit_price  = svc.price,
                total_price = line_total,
                notes       = item.notes
            ))
        else:
            # ── Бараа материал ──────────────────────────────
            prod = db.query(InventoryItem).filter(
                InventoryItem.id == item.product_id,
                InventoryItem.is_for_sale == True
            ).first()
            if not prod:
                raise HTTPException(status_code=404, detail=f"Бараа {item.product_id} олдсонгүй")
            if prod.quantity < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"{prod.name}: үлдэгдэл хүрэлцэхгүй ({prod.quantity} {prod.unit})"
                )
            line_total = prod.sale_price * item.quantity
            subtotal += line_total
            prod.quantity -= item.quantity   # Үлдэгдэл хасах
            item_rows.append(OrderItem(
                product_id  = prod.id,
                item_type   = "product",
                item_name   = prod.name,
                quantity    = item.quantity,
                unit_price  = prod.sale_price,
                total_price = line_total,
                notes       = item.notes
            ))

    # 2. НӨАТ
    #  Бараанд «НӨАТ-тэй авах» сонгосон бол үнийг эхлээд +10% болгоно
    #  (нийт төлөх дүн өснө), дараа нь бүх НӨАТ-тэй мөрөөс задална.
    _apply_product_vat(item_rows, payload.product_vat)
    subtotal = sum(r.total_price for r in item_rows)   # барааны үнэ өөрчлөгдсөн
    vat_amount = _calc_vat(item_rows, payload.product_vat)

    # 3. Хямдрал
    discount_amount = _calc_discount(
        subtotal,
        payload.discount_type.value if payload.discount_type else None,
        payload.discount_value or 0.0
    )

    # 4. Төлбөргүй захиалга эсвэл төлбөртэй
    is_unpaid = payload.payment_method.value == "unpaid"

    # Оноогоор төлбөр тооцоолох (1 оноо = 1₮)
    points_used = 0
    if not is_unpaid and payload.payment_method.value in ("points", "mixed") and payload.customer_id:
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if customer:
            max_points = min(customer.points, int(subtotal - discount_amount))
            points_used = min(payload.points_used, max_points)

    # НӨАТ дүнд багтсан тул нэмэхгүй
    total = max(0.0, subtotal - discount_amount - points_used)

    # 4. Earned points (зөвхөн төлбөр төлсөн үед)
    points_earned = 0
    if not is_unpaid and payload.customer_id:
        # Оноо нь САЛБАРЫН тохиргооноос
        pts_enabled = settings_store.get_bool(db, "points_enabled")
        pts_rate = settings_store.get_float(db, "points_earn_rate", 1.0)
        if pts_enabled and pts_rate > 0:
            points_earned = int(total * pts_rate / 100)

    # 5. Захиалга хадгалах
    order = Order(
        order_number    = _generate_order_number(db),
        customer_id     = payload.customer_id,
        cashier_id      = current_user.id,
        phone           = payload.phone or None,
        cashier_name    = payload.cashier_name,
        subtotal        = subtotal,
        discount_type   = payload.discount_type.value if payload.discount_type else None,
        discount_value  = payload.discount_value or 0.0,
        discount_amount = discount_amount,
        vat_amount      = vat_amount,
        product_vat     = payload.product_vat,
        total           = total,
        payment_method  = payload.payment_method.value,
        payment_details = payload.payment_details,
        points_used     = points_used,
        points_earned   = points_earned,
        is_paid         = not is_unpaid,
        paid_at         = None if is_unpaid else _now_local(),
        paid_by_id      = None if is_unpaid else current_user.id,
        paid_by         = None if is_unpaid else payload.cashier_name,
        notes           = payload.notes,
        status          = "delivered" if no_laundry_work else "pending",
        delivered_at    = _now_local() if no_laundry_work else None,
    )
    order.items = item_rows
    db.add(order)

    # 6. Шүршүүрийн session үүсгэх — хүн бүрд НЭГ тасалбар
    #    Өрөө энд оноогдохгүй: бүгд дараалалд орж, дараа нь үйлчлэгч
    #    үйлчлүүлэгчийн саналаар өрөөнүүдэд хуваарилна.
    if pending_sessions:
        db.flush()   # order.id болон item_rows[i].id гаргаж авах

        cust_name = None
        if payload.customer_id:
            c = db.query(Customer).filter(Customer.id == payload.customer_id).first()
            cust_name = c.name if c else None
        customer_snapshot = cust_name or payload.phone or "—"

        # Дарааллын дугаар — өдөр бүр ГЛОБАЛ, 001-ээс эхэлнэ.
        # (Худалдан авах үед өрөөний төрөл тодорхойгүй тул төрлөөр
        #  салгах боломжгүй болсон.)
        day_start = _now_local().replace(hour=0, minute=0, second=0, microsecond=0)
        next_no = db.query(func.max(RoomSession.queue_no)).filter(
            RoomSession.created_at >= day_start
        ).scalar() or 0

        for idx, tariff, qty in pending_sessions:
            for _ in range(qty):
                next_no += 1
                db.add(RoomSession(
                    room_id       = None,
                    room_type_id  = None,          # өрөө оноогдох үед бөглөгдөнө
                    tariff_id     = tariff.id,
                    order_id      = order.id,
                    order_item_id = item_rows[idx].id,
                    queue_no      = next_no,
                    room_number   = None,
                    type_name     = tariff.name,
                    customer_name = customer_snapshot,
                    price         = tariff.price,
                    duration_min  = 0,   # өрөө оноогдох үед бөглөгдөнө
                    status        = "waiting",
                ))

    # 7. Үйлчлүүлэгчийн оноо шинэчлэх (зөвхөн төлбөр төлсөн үед)
    if not is_unpaid and payload.customer_id:
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if customer:
            customer.points = max(0, customer.points - points_used) + points_earned
            customer.total_spent += total

    db.commit()
    db.refresh(order)

    # eager load for response (sessions — тасалбар хэвлэхэд шаардлагатай)
    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.sessions),
    ).filter(Order.id == order.id).first()


@router.post("/{order_id}/items", response_model=OrderOut)
def add_order_item(order_id: int, payload: OrderItemCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Төлбөр төлөгдөөгүй захиалгад үйлчилгээ эсвэл бараа нэмэх"""
    o = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    if o.is_paid:
        raise HTTPException(status_code=400, detail="Төлбөр төлөгдсөн захиалгыг өөрчлөх боломжгүй")
    if o.status in ("delivered", "archived", "deleted"):
        raise HTTPException(status_code=400, detail="Хаагдсан захиалгад нэмэх боломжгүй")
    if not payload.service_id and not payload.product_id:
        raise HTTPException(status_code=400, detail="service_id эсвэл product_id заавал байх ёстой")

    qty = max(1, payload.quantity or 1)

    if payload.service_id:
        svc = db.query(Service).filter(
            Service.id == payload.service_id, Service.is_active == True
        ).first()
        if not svc:
            raise HTTPException(status_code=404, detail=f"Үйлчилгээ {payload.service_id} олдсонгүй")
        line_total = svc.price * qty
        new_item = OrderItem(
            order_id    = o.id,
            service_id  = svc.id,
            item_type   = "service",
            item_name   = svc.name,
            quantity    = qty,
            unit_price  = svc.price,
            total_price = line_total,
            notes       = payload.notes,
        )
    else:
        prod = db.query(InventoryItem).filter(
            InventoryItem.id == payload.product_id,
            InventoryItem.is_for_sale == True
        ).first()
        if not prod:
            raise HTTPException(status_code=404, detail=f"Бараа {payload.product_id} олдсонгүй")
        if prod.quantity < qty:
            raise HTTPException(
                status_code=400,
                detail=f"{prod.name}: үлдэгдэл хүрэлцэхгүй ({prod.quantity} {prod.unit})"
            )
        line_total = prod.sale_price * qty
        prod.quantity -= qty   # Үлдэгдэл хасах
        new_item = OrderItem(
            order_id    = o.id,
            product_id  = prod.id,
            item_type   = "product",
            item_name   = prod.name,
            quantity    = qty,
            unit_price  = prod.sale_price,
            total_price = line_total,
            notes       = payload.notes,
        )

    # Шинэ барааны мөрөнд ч захиалгын НӨАТ-ийн сонголт үйлчилнэ
    #  (хуучин мөрүүд аль хэдийн нэмэгдсэн тул зөвхөн шинийг нь)
    _apply_product_vat([new_item], bool(o.product_vat))
    o.items.append(new_item)

    # Дүнг дахин тооцоолох (хямдрал хувиар бол subtotal-аас дахин бодогдоно)
    subtotal = sum(it.total_price for it in o.items)
    discount_amount = _calc_discount(subtotal, o.discount_type, o.discount_value or 0.0)
    vat_amount      = _calc_vat(o.items, bool(o.product_vat))
    o.subtotal        = subtotal
    o.discount_amount = discount_amount
    o.vat_amount      = vat_amount
    o.total           = max(0.0, subtotal - discount_amount - (o.points_used or 0))

    db.commit()
    db.refresh(o)

    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == o.id).first()


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)):
    """Угаалгын явц шинэчлэх"""
    o = db.query(Order).options(
        joinedload(Order.customer)
    ).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")

    prev_status = o.status
    o.status = payload.status.value

    if payload.status.value == "delivered":
        o.delivered_at = _now_local()

    db.commit()
    db.refresh(o)

    # ── SMS мэдэгдэл: Бэлэн болсон үед (зөвхөн үйлчилгээтэй захиалга) ──
    if payload.status.value == "ready" and prev_status != "ready":
        has_service = any(i.item_type == "service" for i in o.items)
        if has_service:
            sms_phone = o.phone or (o.customer.phone if o.customer else None)
            if sms_phone:
                send_ready_sms(sms_phone, o.order_number,
                               settings_store.sms_config(db))

    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()


@router.patch("/{order_id}/notes", response_model=OrderOut)
def update_order_notes(order_id: int, payload: dict, db: Session = Depends(get_db)):
    """Захиалгын тайлбар шинэчлэх"""
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    o.notes = payload.get("notes", "")
    db.commit()
    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()


@router.patch("/{order_id}/pay", response_model=OrderOut)
def pay_order(
    order_id: int,
    payload: OrderPayRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Төлбөр авах"""
    o = db.query(Order).options(
        joinedload(Order.customer)
    ).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    if o.is_paid:
        raise HTTPException(status_code=400, detail="Аль хэдийн төлбөр төлөгдсөн")

    # Оноогоор төлбөр
    points_used = 0
    if payload.payment_method.value in ("points", "mixed") and o.customer_id:
        customer = db.query(Customer).filter(Customer.id == o.customer_id).first()
        if customer:
            max_points = min(customer.points, int(o.total))
            points_used = min(payload.points_used, max_points)

    # Earned points
    points_earned = 0
    if o.customer_id:
        pts_enabled = settings_store.get_bool(db, "points_enabled")
        pts_rate = settings_store.get_float(db, "points_earn_rate", 1.0)
        if pts_enabled and pts_rate > 0:
            points_earned = int(o.total * pts_rate / 100)

    o.payment_method = payload.payment_method.value
    o.payment_details = payload.payment_details
    o.points_used = points_used
    o.points_earned = points_earned
    o.is_paid = True
    o.paid_at = _now_local()
    o.paid_by_id = current_user.id
    o.paid_by = current_user.full_name

    # Үйлчлүүлэгчийн оноо шинэчлэх
    if o.customer_id:
        customer = db.query(Customer).filter(Customer.id == o.customer_id).first()
        if customer:
            customer.points = max(0, customer.points - points_used) + points_earned
            customer.total_spent += o.total

    db.commit()

    return db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items).joinedload(OrderItem.service),
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """Захиалга устгах (soft delete)"""
    o = db.query(Order).options(
        joinedload(Order.items)
    ).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Захиалга олдсонгүй")
    # Restore customer points if applicable
    if o.customer_id and o.is_paid:
        customer = db.query(Customer).filter(Customer.id == o.customer_id).first()
        if customer:
            customer.points = max(0, customer.points + o.points_used - o.points_earned)
            customer.total_spent = max(0, customer.total_spent - o.total)
    # Restore product inventory
    for item in o.items:
        if item.product_id:
            prod = db.query(InventoryItem).filter(InventoryItem.id == item.product_id).first()
            if prod:
                prod.quantity += item.quantity
    # Шүршүүрийн session-уудыг цуцлах (өрөө суларна, дарааллаас хасагдана)
    for s in db.query(RoomSession).filter(
        RoomSession.order_id == o.id,
        RoomSession.status.in_(SESSION_ACTIVE_STATUSES),
    ).all():
        s.status = "cancelled"
        s.ended_at = _now_local()
    # Soft delete
    o.status = "deleted"
    o.deleted_at = _now_local()
    db.commit()
    return {"ok": True}


@router.post("/archive-delivered")
def archive_delivered(db: Session = Depends(get_db)):
    """Олгосон бүх захиалгыг архивлах"""
    count = db.query(Order).filter(Order.status == "delivered").update({"status": "archived"})
    db.commit()
    return {"archived": count}


# ── Coupon endpoints ────────────────────────────────────
@router.post("/coupons/validate", response_model=dict)
def validate_coupon(payload: CouponValidate, db: Session = Depends(get_db)):
    """Купон шалгах"""
    coupon = db.query(Coupon).filter(
        Coupon.code == payload.code.upper(),
        Coupon.is_active == True
    ).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Купон олдсонгүй эсвэл идэвхгүй")
    if coupon.expires_at and coupon.expires_at < _now_local():
        raise HTTPException(status_code=400, detail="Купоны хугацаа дууссан")
    if coupon.max_uses and coupon.used_count >= coupon.max_uses:
        raise HTTPException(status_code=400, detail="Купон ашигласан тоо хэтэрсэн")
    if payload.amount < coupon.min_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Доод дүн {coupon.min_amount:,.0f}₮ байх ёстой"
        )
    discount = _calc_discount(payload.amount, coupon.discount_type, coupon.discount_value)
    return {
        "valid": True,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "discount_amount": discount
    }


# ── Coupon CRUD ────────────────────────────────────────
@router.get("/coupons/", response_model=List[CouponOut])
def list_coupons(db: Session = Depends(get_db)):
    return db.query(Coupon).order_by(Coupon.created_at.desc()).all()


@router.post("/coupons/", response_model=CouponOut)
def create_coupon(payload: CouponCreate, db: Session = Depends(get_db)):
    existing = db.query(Coupon).filter(Coupon.code == payload.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Энэ кодтой купон аль хэдийн байна")
    c = Coupon(
        code=payload.code.upper(),
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        min_amount=payload.min_amount,
        max_uses=payload.max_uses,
        expires_at=payload.expires_at,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, payload: CouponCreate, db: Session = Depends(get_db)):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Купон олдсонгүй")
    c.code = payload.code.upper()
    c.discount_type = payload.discount_type
    c.discount_value = payload.discount_value
    c.min_amount = payload.min_amount
    c.max_uses = payload.max_uses
    c.expires_at = payload.expires_at
    db.commit()
    db.refresh(c)
    return c


@router.patch("/coupons/{coupon_id}/toggle", response_model=CouponOut)
def toggle_coupon(coupon_id: int, db: Session = Depends(get_db)):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Купон олдсонгүй")
    c.is_active = not c.is_active
    db.commit()
    db.refresh(c)
    return c


@router.delete("/coupons/{coupon_id}")
def delete_coupon(coupon_id: int, db: Session = Depends(get_db)):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Купон олдсонгүй")
    db.delete(c)
    db.commit()
    return {"ok": True}
