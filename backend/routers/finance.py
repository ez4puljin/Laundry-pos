"""Санхүүгийн модуль (зөвхөн админ).

Хялбаршуулсан, давхар бичилтгүй:
- Мөнгөн данс (Касс, Банк …) — POS-ийн төлбөрийн хэлбэртэй холбогдоно
- Нийлүүлэгч
- Худалдан авалт (Бараа материалын орлого) — үлдэгдэл нэмэгдэж, өртөг шинэчлэгдэнэ
- Авлага / Өглөгийн тооцоо (үүсгэх, хэсэгчлэн төлөх, хаах)
- Кассын журнал (орлого / зарлага: цалин, түрээс г.м.)
- Нэгдсэн тайлан (POS борлуулалт автоматаар орно)
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List

from database import SessionLocal
from auth import get_current_user
import models
import schemas

_LOCAL_TZ = timezone(timedelta(hours=8))
def _now_local():
    return datetime.now(_LOCAL_TZ)

router = APIRouter(prefix="/finance", tags=["finance"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_date(s: Optional[str], default: Optional[datetime] = None) -> datetime:
    """'YYYY-MM-DD' → локал датетайм (00:00). Хоосон бол default эсвэл одоо."""
    if not s:
        return default if default is not None else _now_local()
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
        return d.replace(tzinfo=_LOCAL_TZ)
    except ValueError:
        raise HTTPException(400, "Огноо буруу байна (YYYY-MM-DD)")


def _range_filter(q, col, start: Optional[str], end: Optional[str]):
    """[start 00:00, end 23:59:59] хүрээгээр шүүнэ."""
    if start:
        q = q.filter(col >= _parse_date(start))
    if end:
        q = q.filter(col < _parse_date(end) + timedelta(days=1))
    return q


# ── POS борлуулалтыг төлбөрийн хэлбэрээр задлах ────────────
def _pos_split(db: Session, start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Төлөгдсөн захиалгуудын дүнг бэлэн/шилжүүлэг/карт/оноогоор задална."""
    q = db.query(models.Order).filter(
        models.Order.is_paid == True,
        models.Order.status != "deleted",
    )
    q = _range_filter(q, models.Order.paid_at, start, end)

    split = {"cash": 0.0, "transfer": 0.0, "card": 0.0, "points": 0.0}
    total = 0.0
    for o in q.all():
        total += o.total
        if o.payment_method == "mixed" and o.payment_details:
            try:
                for method, amount in json.loads(o.payment_details).items():
                    if method in split:
                        split[method] += float(amount)
            except Exception:
                pass
        elif o.payment_method in split:
            split[o.payment_method] += o.total
    return {"total": total, **split}


def _account_balance(acc: models.FinAccount, db: Session, pos_all: dict) -> float:
    """Дансны үлдэгдэл = POS орлого (холбогдсон хэлбэрүүд, бүх цаг) + журналын орлого − зарлага."""
    bal = 0.0
    if acc.pos_cash:
        bal += pos_all["cash"]
    if acc.pos_transfer:
        bal += pos_all["transfer"]
    if acc.pos_card:
        bal += pos_all["card"]
    inc = db.query(func.coalesce(func.sum(models.FinTransaction.amount), 0.0)).filter(
        models.FinTransaction.account_id == acc.id,
        models.FinTransaction.direction == "income",
    ).scalar()
    exp = db.query(func.coalesce(func.sum(models.FinTransaction.amount), 0.0)).filter(
        models.FinTransaction.account_id == acc.id,
        models.FinTransaction.direction == "expense",
    ).scalar()
    return bal + inc - exp


def _account_out(acc: models.FinAccount, db: Session, pos_all: dict) -> dict:
    return {
        "id": acc.id, "name": acc.name, "sort_order": acc.sort_order,
        "is_active": acc.is_active,
        "pos_cash": acc.pos_cash, "pos_transfer": acc.pos_transfer, "pos_card": acc.pos_card,
        "balance": round(_account_balance(acc, db, pos_all)),
    }


def _supplier_payable(supplier_id: int, db: Session) -> float:
    """Нийлүүлэгчийн нээлттэй өглөгийн үлдэгдэл."""
    rows = db.query(models.DebtEntry).filter(
        models.DebtEntry.kind == "payable",
        models.DebtEntry.partner_type == "supplier",
        models.DebtEntry.partner_id == supplier_id,
        models.DebtEntry.status == "open",
    ).all()
    return sum(d.amount - d.paid_amount for d in rows)


# ═══════════════════════════════════════════════════════════
#  Мөнгөн данс
# ═══════════════════════════════════════════════════════════
@router.get("/accounts", response_model=List[schemas.FinAccountOut])
def list_accounts(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.FinAccount)
    if active_only:
        q = q.filter(models.FinAccount.is_active == True)
    pos_all = _pos_split(db)
    return [_account_out(a, db, pos_all)
            for a in q.order_by(models.FinAccount.sort_order, models.FinAccount.id).all()]


def _clear_pos_flags(db: Session, data: dict, exclude_id: Optional[int] = None):
    """Нэг POS төлбөрийн хэлбэр зөвхөн нэг дансанд — бусдаас нь болиулна."""
    for flag in ("pos_cash", "pos_transfer", "pos_card"):
        if data.get(flag):
            q = db.query(models.FinAccount).filter(getattr(models.FinAccount, flag) == True)
            if exclude_id:
                q = q.filter(models.FinAccount.id != exclude_id)
            for other in q.all():
                setattr(other, flag, False)


@router.post("/accounts", response_model=schemas.FinAccountOut)
def create_account(data: schemas.FinAccountCreate, db: Session = Depends(get_db)):
    _clear_pos_flags(db, data.model_dump())
    acc = models.FinAccount(**data.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _account_out(acc, db, _pos_split(db))


@router.put("/accounts/{account_id}", response_model=schemas.FinAccountOut)
def update_account(account_id: int, data: schemas.FinAccountUpdate, db: Session = Depends(get_db)):
    acc = db.query(models.FinAccount).get(account_id)
    if not acc:
        raise HTTPException(404, "Данс олдсонгүй")
    payload = data.model_dump(exclude_unset=True)
    _clear_pos_flags(db, payload, exclude_id=account_id)
    for field, value in payload.items():
        if value is not None:
            setattr(acc, field, value)
    db.commit()
    db.refresh(acc)
    return _account_out(acc, db, _pos_split(db))


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(models.FinAccount).get(account_id)
    if not acc:
        raise HTTPException(404, "Данс олдсонгүй")
    acc.is_active = False
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Нийлүүлэгч
# ═══════════════════════════════════════════════════════════
@router.get("/suppliers", response_model=List[schemas.SupplierOut])
def list_suppliers(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Supplier)
    if active_only:
        q = q.filter(models.Supplier.is_active == True)
    out = []
    for s in q.order_by(models.Supplier.name).all():
        row = schemas.SupplierOut.model_validate(s).model_dump()
        row["payable_balance"] = _supplier_payable(s.id, db)
        out.append(row)
    return out


@router.post("/suppliers", response_model=schemas.SupplierOut)
def create_supplier(data: schemas.SupplierCreate, db: Session = Depends(get_db)):
    if db.query(models.Supplier).filter(
        models.Supplier.name == data.name, models.Supplier.is_active == True
    ).first():
        raise HTTPException(400, "Энэ нэртэй нийлүүлэгч аль хэдийн байна")
    s = models.Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/suppliers/{supplier_id}", response_model=schemas.SupplierOut)
def update_supplier(supplier_id: int, data: schemas.SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(models.Supplier).get(supplier_id)
    if not s:
        raise HTTPException(404, "Нийлүүлэгч олдсонгүй")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Supplier).get(supplier_id)
    if not s:
        raise HTTPException(404, "Нийлүүлэгч олдсонгүй")
    if _supplier_payable(supplier_id, db) > 0:
        raise HTTPException(400, "Нээлттэй өглөгтэй нийлүүлэгчийг устгах боломжгүй")
    s.is_active = False
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Худалдан авалт (Бараа материалын орлого)
# ═══════════════════════════════════════════════════════════
def _generate_purchase_number(db: Session) -> str:
    today = date.today().strftime("%Y%m%d")
    prefix = f"PUR-{today}-"
    last = db.query(func.max(models.PurchaseDoc.doc_number)).filter(
        models.PurchaseDoc.doc_number.like(f"{prefix}%")
    ).scalar()
    seq = int(last.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:03d}"


@router.get("/purchases", response_model=List[schemas.PurchaseOut])
def list_purchases(
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.PurchaseDoc).options(joinedload(models.PurchaseDoc.items))
    q = _range_filter(q, models.PurchaseDoc.doc_date, start, end)
    return q.order_by(models.PurchaseDoc.doc_date.desc(), models.PurchaseDoc.id.desc()).all()


@router.post("/purchases", response_model=schemas.PurchaseOut)
def create_purchase(
    data: schemas.PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not data.items:
        raise HTTPException(400, "Бараа материал сонгоно уу")
    if data.payment_type not in ("paid", "credit"):
        raise HTTPException(400, "Төлбөрийн төрөл буруу байна")

    supplier = None
    if data.supplier_id:
        supplier = db.query(models.Supplier).get(data.supplier_id)
        if not supplier:
            raise HTTPException(404, "Нийлүүлэгч олдсонгүй")

    account = None
    if data.payment_type == "paid":
        if not data.account_id:
            raise HTTPException(400, "Төлсөн данс сонгоно уу")
        account = db.query(models.FinAccount).get(data.account_id)
        if not account or not account.is_active:
            raise HTTPException(404, "Данс олдсонгүй")
    else:  # credit — өглөг нийлүүлэгч дээр үүснэ
        if not supplier:
            raise HTTPException(400, "Өглөгөөр авахад нийлүүлэгч заавал сонгоно")

    doc = models.PurchaseDoc(
        doc_number    = _generate_purchase_number(db),
        doc_date      = _parse_date(data.doc_date),
        supplier_id   = supplier.id if supplier else None,
        supplier_name = supplier.name if supplier else None,
        description   = data.description,
        payment_type  = data.payment_type,
        account_id    = account.id if account else None,
        created_by_id = current_user.id,
        created_by    = current_user.full_name,
    )

    total = 0.0
    for item in data.items:
        prod = db.query(models.InventoryItem).get(item.product_id)
        if not prod:
            raise HTTPException(404, f"Бараа {item.product_id} олдсонгүй")
        if item.quantity <= 0 or item.unit_cost < 0:
            raise HTTPException(400, f"{prod.name}: тоо/үнэ буруу байна")
        line_total = round(item.quantity * item.unit_cost, 2)
        total += line_total
        # Үлдэгдэл нэмэгдэж, өртөг шинэчлэгдэнэ
        prod.quantity += item.quantity
        prod.cost_price = item.unit_cost
        doc.items.append(models.PurchaseItem(
            product_id = prod.id,
            item_name  = prod.name,
            location   = item.location,
            quantity   = item.quantity,
            unit_cost  = item.unit_cost,
            total      = line_total,
        ))
    doc.total = round(total, 2)
    db.add(doc)
    db.flush()

    if data.payment_type == "paid":
        db.add(models.FinTransaction(
            doc_date     = doc.doc_date,
            direction    = "expense",
            account_id   = account.id,
            category     = "Худалдан авалт",
            partner_type = "supplier" if supplier else None,
            partner_id   = supplier.id if supplier else None,
            partner_name = supplier.name if supplier else None,
            description  = data.description or f"Худалдан авалт {doc.doc_number}",
            amount       = doc.total,
            purchase_id  = doc.id,
        ))
    else:
        db.add(models.DebtEntry(
            kind         = "payable",
            partner_type = "supplier",
            partner_id   = supplier.id,
            partner_name = supplier.name,
            description  = data.description or f"Худалдан авалт {doc.doc_number}",
            amount       = doc.total,
            doc_date     = doc.doc_date,
            purchase_id  = doc.id,
        ))

    db.commit()
    return db.query(models.PurchaseDoc).options(
        joinedload(models.PurchaseDoc.items)
    ).filter(models.PurchaseDoc.id == doc.id).first()


@router.delete("/purchases/{purchase_id}")
def delete_purchase(purchase_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.PurchaseDoc).options(
        joinedload(models.PurchaseDoc.items)
    ).filter(models.PurchaseDoc.id == purchase_id).first()
    if not doc:
        raise HTTPException(404, "Худалдан авалт олдсонгүй")

    debt = db.query(models.DebtEntry).filter(models.DebtEntry.purchase_id == doc.id).first()
    if debt and debt.paid_amount > 0:
        raise HTTPException(400, "Төлбөр хийгдсэн өглөгтэй худалдан авалтыг устгах боломжгүй")

    # Үлдэгдэл буцаана
    for item in doc.items:
        prod = db.query(models.InventoryItem).get(item.product_id)
        if prod:
            prod.quantity = max(0.0, prod.quantity - item.quantity)

    db.query(models.FinTransaction).filter(
        models.FinTransaction.purchase_id == doc.id
    ).delete(synchronize_session=False)
    if debt:
        db.delete(debt)
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Авлага / Өглөг
# ═══════════════════════════════════════════════════════════
@router.get("/debts", response_model=List[schemas.DebtOut])
def list_debts(
    kind: Optional[str] = None,
    status: Optional[str] = None,   # open | closed
    db: Session = Depends(get_db),
):
    q = db.query(models.DebtEntry)
    if kind in ("receivable", "payable"):
        q = q.filter(models.DebtEntry.kind == kind)
    if status in ("open", "closed"):
        q = q.filter(models.DebtEntry.status == status)
    return q.order_by(models.DebtEntry.status.desc(), models.DebtEntry.doc_date.desc(),
                      models.DebtEntry.id.desc()).all()


@router.post("/debts", response_model=schemas.DebtOut)
def create_debt(
    data: schemas.DebtCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if data.kind not in ("receivable", "payable"):
        raise HTTPException(400, "Төрөл буруу байна")
    if data.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    if not data.partner_name.strip():
        raise HTTPException(400, "Харилцагчийн нэр оруулна уу")
    d = models.DebtEntry(
        kind         = data.kind,
        partner_type = data.partner_type,
        partner_id   = data.partner_id,
        partner_name = data.partner_name.strip(),
        description  = data.description,
        amount       = data.amount,
        doc_date     = _parse_date(data.doc_date),
        created_by_id = current_user.id,
        created_by    = current_user.full_name,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.post("/debts/{debt_id}/pay", response_model=schemas.DebtOut)
def pay_debt(
    debt_id: int,
    data: schemas.DebtPayRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    d = db.query(models.DebtEntry).get(debt_id)
    if not d:
        raise HTTPException(404, "Тооцоо олдсонгүй")
    if d.status == "closed":
        raise HTTPException(400, "Тооцоо аль хэдийн хаагдсан байна")
    remaining = round(d.amount - d.paid_amount, 2)
    if data.amount <= 0 or data.amount > remaining + 0.01:
        raise HTTPException(400, f"Дүн 1-{remaining:,.0f}₮ хооронд байх ёстой")
    account = db.query(models.FinAccount).get(data.account_id)
    if not account or not account.is_active:
        raise HTTPException(404, "Данс олдсонгүй")

    # Авлага төлөгдөхөд мөнгө ОРЖ ирнэ, өглөг төлөхөд ГАРНА
    direction = "income" if d.kind == "receivable" else "expense"
    category  = "Авлага төлөлт" if d.kind == "receivable" else "Өглөг төлөлт"
    db.add(models.FinTransaction(
        doc_date     = _parse_date(data.doc_date),
        direction    = direction,
        account_id   = account.id,
        category     = category,
        partner_type = d.partner_type,
        partner_id   = d.partner_id,
        partner_name = d.partner_name,
        description  = data.description or (d.description or category),
        amount       = data.amount,
        debt_id      = d.id,
        created_by_id = current_user.id,
        created_by    = current_user.full_name,
    ))
    d.paid_amount = round(d.paid_amount + data.amount, 2)
    if d.paid_amount >= d.amount - 0.01:
        d.status = "closed"
        d.closed_at = _now_local()
    db.commit()
    db.refresh(d)
    return d


@router.delete("/debts/{debt_id}")
def delete_debt(debt_id: int, db: Session = Depends(get_db)):
    d = db.query(models.DebtEntry).get(debt_id)
    if not d:
        raise HTTPException(404, "Тооцоо олдсонгүй")
    if d.paid_amount > 0:
        raise HTTPException(400, "Төлбөр хийгдсэн тооцоог устгах боломжгүй")
    if d.purchase_id:
        raise HTTPException(400, "Худалдан авалттай холбоотой — худалдан авалтыг нь устгана уу")
    db.delete(d)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Кассын журнал
# ═══════════════════════════════════════════════════════════
@router.get("/transactions", response_model=List[schemas.FinTxOut])
def list_transactions(
    start: Optional[str] = None,
    end: Optional[str] = None,
    direction: Optional[str] = None,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.FinTransaction)
    q = _range_filter(q, models.FinTransaction.doc_date, start, end)
    if direction in ("income", "expense"):
        q = q.filter(models.FinTransaction.direction == direction)
    if account_id:
        q = q.filter(models.FinTransaction.account_id == account_id)
    return q.order_by(models.FinTransaction.doc_date.desc(),
                      models.FinTransaction.id.desc()).limit(500).all()


@router.post("/transactions", response_model=schemas.FinTxOut)
def create_transaction(
    data: schemas.FinTxCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if data.direction not in ("income", "expense"):
        raise HTTPException(400, "Чиглэл буруу байна")
    if data.amount <= 0:
        raise HTTPException(400, "Дүн 0-ээс их байх ёстой")
    account = db.query(models.FinAccount).get(data.account_id)
    if not account or not account.is_active:
        raise HTTPException(404, "Данс олдсонгүй")
    tx = models.FinTransaction(
        doc_date     = _parse_date(data.doc_date),
        direction    = data.direction,
        account_id   = account.id,
        category     = data.category or "Бусад",
        partner_type = data.partner_type,
        partner_id   = data.partner_id,
        partner_name = (data.partner_name or "").strip() or None,
        description  = data.description,
        amount       = data.amount,
        created_by_id = current_user.id,
        created_by    = current_user.full_name,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.query(models.FinTransaction).get(tx_id)
    if not tx:
        raise HTTPException(404, "Гүйлгээ олдсонгүй")
    if tx.purchase_id:
        raise HTTPException(400, "Худалдан авалттай холбоотой — худалдан авалтыг нь устгана уу")
    if tx.debt_id:
        # Тооцооны төлбөрийг буцаана — тооцоо дахин нээгдэнэ
        d = db.query(models.DebtEntry).get(tx.debt_id)
        if d:
            d.paid_amount = max(0.0, round(d.paid_amount - tx.amount, 2))
            if d.status == "closed":
                d.status = "open"
                d.closed_at = None
    db.delete(tx)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Нэгдсэн тайлан
# ═══════════════════════════════════════════════════════════
@router.get("/summary")
def summary(
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # POS борлуулалт (сонгосон хугацаанд)
    pos = _pos_split(db, start, end)

    # Журналын орлого / зарлага (POS давхардахгүй — журналд POS бичигддэггүй)
    tx_q = _range_filter(db.query(models.FinTransaction),
                         models.FinTransaction.doc_date, start, end)
    txs = tx_q.all()
    other_income  = sum(t.amount for t in txs if t.direction == "income")
    total_expense = sum(t.amount for t in txs if t.direction == "expense")

    expense_by_cat = {}
    for t in txs:
        if t.direction == "expense":
            expense_by_cat[t.category] = expense_by_cat.get(t.category, 0.0) + t.amount

    # Худалдан авалт (сонгосон хугацаанд): данснаас төлсөн нь зардалд орсон,
    # өглөгөөр авсан нь тусдаа харагдана
    pur_q = _range_filter(db.query(models.PurchaseDoc),
                          models.PurchaseDoc.doc_date, start, end)
    purchases = pur_q.all()
    purchases_total  = sum(p.total for p in purchases)
    purchases_credit = sum(p.total for p in purchases if p.payment_type == "credit")

    # Нээлттэй авлага / өглөг (бүх цаг)
    open_debts = db.query(models.DebtEntry).filter(models.DebtEntry.status == "open").all()
    receivable_open = sum(d.amount - d.paid_amount for d in open_debts if d.kind == "receivable")
    payable_open    = sum(d.amount - d.paid_amount for d in open_debts if d.kind == "payable")

    # Төлөгдөөгүй POS захиалга (бүх цаг) — кассын авлагын нэг хэсэг
    unpaid_orders = db.query(func.coalesce(func.sum(models.Order.total), 0.0)).filter(
        models.Order.is_paid == False,
        models.Order.status.notin_(["deleted", "archived"]),
    ).scalar()

    # Дансдын үлдэгдэл (бүх цаг)
    pos_all = _pos_split(db)
    accounts = [
        _account_out(a, db, pos_all)
        for a in db.query(models.FinAccount).filter(models.FinAccount.is_active == True)
        .order_by(models.FinAccount.sort_order, models.FinAccount.id).all()
    ]

    total_income = pos["total"] + other_income
    return {
        "pos": pos,
        "other_income": other_income,
        "total_income": total_income,
        "total_expense": total_expense,
        "net": total_income - total_expense,
        "expense_by_category": [
            {"category": k, "amount": v}
            for k, v in sorted(expense_by_cat.items(), key=lambda x: -x[1])
        ],
        "purchases_total": purchases_total,
        "purchases_credit": purchases_credit,
        "receivable_open": receivable_open,
        "payable_open": payable_open,
        "unpaid_orders": unpaid_orders,
        "accounts": accounts,
    }
