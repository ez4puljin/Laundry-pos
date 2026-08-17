from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_, and_
from datetime import date, timedelta
from typing import List
import json

from database import get_db
from models import (
    Order, OrderItem, Service, Customer, InventoryItem, CashierShift, User,
    order_kind_condition,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _revenue_scope():
    """Орлогын тайланд тооцох захиалгуудын нөхцөл.

    • Устгагдсан захиалга ороогүй.
    • Дараалалд хүлээгдэж буй (pending) захиалга ороогүй — хараахан гүйцээгүй.
    • Гэхдээ анхааруулгад орсон (төлбөр төлөлгүй явсан) захиалга нь pending байсан ч
      баталгаатай өр учир орлогын тайланд «төлбөр төлөөгүй» болж тооцогдоно.
    """
    return [
        Order.status != "deleted",
        or_(Order.status != "pending", Order.is_flagged == True),
    ]


def _payment_split(orders) -> dict:
    """Захиалгуудыг төлбөрийн хэлбэрээр задлана (төлөгдөөгүйг тусад нь)."""
    split = {"cash": 0.0, "transfer": 0.0, "card": 0.0, "unpaid": 0.0}
    for o in orders:
        if not o.is_paid:
            split["unpaid"] += o.total
            continue
        if o.payment_method == "mixed" and o.payment_details:
            try:
                for method, amount in json.loads(o.payment_details).items():
                    if method in ("cash", "transfer", "card"):
                        split[method] += float(amount)
            except Exception:
                pass
        elif o.payment_method in ("cash", "transfer", "card"):
            split[o.payment_method] += o.total
    return split


@router.get("/dashboard")
def dashboard_summary(kind: str = None, db: Session = Depends(get_db)):
    """Өнөөдрийн хурдан тоймлол. kind: laundry | shower (хоосон = бүгд)"""
    today = date.today()
    today_str = today.isoformat()
    kind_cond = order_kind_condition(kind)
    kind_filter = [kind_cond] if kind_cond is not None else []

    # Өнөөдрийн орлого (устгагдсан захиалга оруулахгүй)
    today_orders = db.query(Order).filter(
        func.date(Order.created_at) == today_str,
        *_revenue_scope(),
        *kind_filter,
    ).all()

    revenue_today = sum(o.total for o in today_orders)   # нийт (төлөгдөөгүй орсон)
    order_count   = len(today_orders)
    avg_order     = revenue_today / order_count if order_count else 0

    # Нөхөж авсан төлбөр — өмнөх өдрийн захиалгын мөнгийг өнөөдөр авсан
    late_orders = db.query(Order).filter(
        Order.is_paid == True,
        Order.paid_at.isnot(None),
        Order.status != "deleted",
        func.date(Order.paid_at) == today_str,
        func.date(Order.paid_at) != func.date(Order.created_at),
        *kind_filter,
    ).all()
    late_total = sum(o.total for o in late_orders)

    # Төлбөрийн хэлбэрээр задаргаа (хосолсон + төлөгдөөгүй + нөхөж авсан)
    payment_breakdown = _payment_split(today_orders + late_orders)
    unpaid_today = payment_breakdown['unpaid']
    unpaid_count = sum(1 for o in today_orders if not o.is_paid)

    # Дараалал статус (washing/ironing → processing гэж бүлэглэнэ).
    # Анхааруулгатай захиалга дараалалд хэвээр үлддэг тул энд ч тоологдоно.
    def _queue_count(*statuses):
        return db.query(Order).filter(Order.status.in_(statuses)).count()

    queue_counts = {
        "pending":    _queue_count("pending"),
        "processing": _queue_count("processing", "washing", "ironing"),
        "ready":      _queue_count("ready"),
        "delivered":  _queue_count("delivered"),
    }

    # Үйлчлүүлэгчдийн тоо
    total_customers = db.query(Customer).count()

    # Бага үлдэгдэлтэй бараа
    low_stock = db.query(InventoryItem).filter(
        InventoryItem.quantity <= InventoryItem.min_quantity
    ).count()

    # Өнөөдрийн устгагдсан захиалгууд
    deleted_orders = db.query(Order).filter(
        func.date(Order.created_at) == today_str,
        Order.status == "deleted",
        *kind_filter,
    ).all()
    deleted_count = len(deleted_orders)
    deleted_total = sum(o.total for o in deleted_orders)

    return {
        "revenue_today":    revenue_today,   # өнөөдрийн захиалгын нийт (төлөгдөөгүй оролцсон)
        # Бодитоор орсон мөнгө = өнөөдрийн төлөгдсөн + нөхөж авсан төлбөр
        "paid_revenue":     revenue_today - unpaid_today + late_total,
        "late_total":       late_total,
        "late_count":       len(late_orders),
        "order_count":      order_count,
        "avg_order":        round(avg_order, 0),
        "queue":            queue_counts,
        "total_customers":  total_customers,
        "low_stock_count":  low_stock,
        "cash_revenue":     payment_breakdown['cash'],
        "transfer_revenue": payment_breakdown['transfer'],
        "card_revenue":     payment_breakdown['card'],
        "unpaid_revenue":   unpaid_today,
        "unpaid_count":     unpaid_count,
        "deleted_count":    deleted_count,
        "deleted_total":    deleted_total,
    }


@router.get("/daily")
def daily_report(
    start: str = Query(default=str(date.today() - timedelta(days=6))),
    end:   str = Query(default=str(date.today())),
    kind:  str = None,          # laundry | shower (хоосон = бүгд)
    db: Session = Depends(get_db)
):
    """Өдрийн орлогын тайлан (chart data)"""
    _paid = Order.is_paid == True
    kind_cond = order_kind_condition(kind)
    kind_filter = [kind_cond] if kind_cond is not None else []
    rows = (
        db.query(
            func.date(Order.created_at).label("day"),
            func.count(Order.id).label("orders"),
            func.sum(Order.total).label("revenue"),
            func.sum(case((and_(_paid, Order.payment_method == "cash"),       Order.total), else_=0)).label("cash"),
            func.sum(case((and_(_paid, Order.payment_method == "transfer"),   Order.total), else_=0)).label("transfer"),
            func.sum(case((and_(_paid, Order.payment_method == "card"),       Order.total), else_=0)).label("card"),
            func.sum(case((and_(_paid, Order.payment_method == "social_pay"), Order.total), else_=0)).label("social_pay"),
            func.sum(case((Order.is_paid == False, Order.total), else_=0)).label("unpaid"),
        )
        .filter(
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
            *_revenue_scope(),
            *kind_filter,
        )
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )
    # Нөхөж авсан төлбөр — төлбөр орсон өдрөөр нь бүлэглэнэ
    late_rows = (
        db.query(
            func.date(Order.paid_at).label("day"),
            func.sum(Order.total).label("late"),
        )
        .filter(
            Order.is_paid == True,
            Order.paid_at.isnot(None),
            Order.status != "deleted",
            func.date(Order.paid_at) >= start,
            func.date(Order.paid_at) <= end,
            func.date(Order.paid_at) != func.date(Order.created_at),
            *kind_filter,
        )
        .group_by(func.date(Order.paid_at))
        .all()
    )
    late_map = {r.day: float(r.late or 0) for r in late_rows}

    days = {r.day for r in rows} | set(late_map)
    by_day = {r.day: r for r in rows}
    return [
        {
            "date":       day,
            "orders":     by_day[day].orders if day in by_day else 0,
            "revenue":    float(by_day[day].revenue or 0) if day in by_day else 0.0,   # тухайн өдрийн захиалга
            "paid":       (float(by_day[day].revenue or 0) - float(by_day[day].unpaid or 0)) if day in by_day else 0.0,
            "unpaid":     float(by_day[day].unpaid or 0) if day in by_day else 0.0,
            "late":       late_map.get(day, 0.0),                                       # нөхөж авсан төлбөр
            "cash":       float(by_day[day].cash or 0) if day in by_day else 0.0,
            "transfer":   float(by_day[day].transfer or 0) if day in by_day else 0.0,
            "card":       float(by_day[day].card or 0) if day in by_day else 0.0,
            "social_pay": float(by_day[day].social_pay or 0) if day in by_day else 0.0,
        }
        for day in sorted(days)
    ]


@router.get("/top-services")
def top_services(
    start: str = Query(default=str(date.today() - timedelta(days=29))),
    end:   str = Query(default=str(date.today())),
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Хамгийн их борлуулагдсан үйлчилгээнүүд"""
    rows = (
        db.query(
            Service.name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.total_price).label("revenue")
        )
        .join(OrderItem, OrderItem.service_id == Service.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            func.date(Order.created_at) >= start,
            func.date(Order.created_at) <= end,
            Order.status.notin_(["pending", "deleted"])
        )
        .group_by(Service.id, Service.name)
        .order_by(func.sum(OrderItem.total_price).desc())
        .limit(limit)
        .all()
    )
    return [
        {"name": r.name, "quantity": int(r.qty or 0), "revenue": float(r.revenue or 0)}
        for r in rows
    ]


@router.get("/inventory-status")
def inventory_status(db: Session = Depends(get_db)):
    """Бараа материалын үлдэгдэл"""
    items = db.query(InventoryItem).order_by(InventoryItem.name).all()
    return [
        {
            "id":           i.id,
            "name":         i.name,
            "unit":         i.unit,
            "quantity":     i.quantity,
            "min_quantity": i.min_quantity,
            "is_low":       i.quantity <= i.min_quantity,
            "cost_price":   i.cost_price,
        }
        for i in items
    ]


@router.get("/cashier-days")
def cashier_days_report(
    start: str = Query(default=str(date.today().replace(day=1))),
    end:   str = Query(default=str(date.today())),
    db: Session = Depends(get_db)
):
    """Касс бүрийн ажилласан өдрийн тоо (нэг өдөр 2 касс = тус бүр 0.5)"""
    shifts = (
        db.query(CashierShift)
        .filter(
            CashierShift.status == "ended",
            func.date(CashierShift.started_at) >= start,
            func.date(CashierShift.started_at) <= end,
        )
        .all()
    )

    # Өдөр бүрд хэдэн касс ажилласныг тоол
    from collections import defaultdict
    day_cashiers = defaultdict(set)  # day -> set of user_ids
    user_names = {}

    for s in shifts:
        day_str = s.started_at.strftime('%Y-%m-%d') if s.started_at else None
        if day_str:
            day_cashiers[day_str].add(s.user_id)
            user = db.query(User).filter(User.id == s.user_id).first()
            if user:
                user_names[s.user_id] = user.full_name

    # Касс бүрд хэдэн өдөр ажилласныг тооцоол
    user_days = defaultdict(float)
    for day_str, user_ids in day_cashiers.items():
        share = 1.0 / len(user_ids)
        for uid in user_ids:
            user_days[uid] += share

    return [
        {
            "user_id": uid,
            "name": user_names.get(uid, "?"),
            "total_days": round(days, 1),
            "total_shifts": sum(1 for s in shifts if s.user_id == uid),
        }
        for uid, days in sorted(user_days.items(), key=lambda x: -x[1])
    ]
