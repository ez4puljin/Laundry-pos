"""И-Баримт 3.0 (PosAPI 3.0) холболт.

PosAPI 3.0 нь Татварын газраас олгодог, ПОС-ын компьютер дээр (эсвэл
дотоод сүлжээнд) ажилладаг үйлчилгээ — анхдагчаар http://localhost:7080.
Баталгаажуулалтгүй тул ИНТЕРНЭТЭД ХЭЗЭЭ Ч нээж болохгүй.

    POST   /rest/receipt     баримт үүсгэх → id (ДДТД), lottery, qrData, date
    DELETE /rest/receipt     баримт буцаах  {id, date}
    GET    /rest/info        ПОС-ын мэдээлэл, бүртгэлтэй ТТД, үлдсэн сугалаа
    GET    /rest/sendData    хуримтлагдсан баримтыг сервер рүү илгээх

Хоёр горимтой (салбар бүр өөрийн тохиргоотой):
    posapi     — жинхэнэ PosAPI руу илгээнэ (staging эсвэл production нь
                 PosAPI-г хэрхэн суулгаснаас хамаарна)
    simulator  — PosAPI-гүйгээр урсгалыг турших. ТАТВАРТ ИЛГЭЭГДЭХГҮЙ;
                 баримт дээр «ТЕСТ — ХҮЧИНГҮЙ» гэж тод хэвлэгдэнэ.

НӨАТ-ын загвар (энэ системийн):
    · Угаалгын үйлчилгээ, шүршүүр — үнэ НӨАТ БАГТСАН → VAT_ABLE
    · Бараа «НӨАТ-тэй» сонгосон үед → VAT_ABLE
    · Бараа НӨАТ-гүй үед → И-Баримтад ОРОХГҮЙ (QR хэвлэгдэхгүй)

PosAPI нь дүнгийн нийлбэрийг яг шалгадаг («totalAmount талбарын утга нь
items ... нийлбэртэй таарсангүй»), тиймээс бүх тооцоог Decimal-аар
2 оронтой хийж, нийлбэрийг ЗӨВХӨН бөөрөнхийлсөн мөрүүдээс гаргана.
"""
import json
import random
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

import requests

import settings_store

D2 = Decimal("0.01")
TIMEOUT = 15          # PosAPI сервер рүү синк хийж байвал удаан хариулж болно


def q(x) -> Decimal:
    return Decimal(str(x)).quantize(D2, ROUND_HALF_UP)


def f(x: Decimal) -> float:
    """JSON-д бөөрөнхийлсөн тоо (float drift-гүй)."""
    return float(x.quantize(D2, ROUND_HALF_UP))


# ── Тохиргоо ───────────────────────────────────────────
def config(db) -> dict:
    s = settings_store.get_all(db)
    return {
        "enabled":       str(s["ebarimt_enabled"]).lower() == "true",
        "mode":          s["ebarimt_mode"] or "posapi",
        "url":           (s["ebarimt_url"] or "http://localhost:7080").rstrip("/"),
        "merchant_tin":  (s["ebarimt_merchant_tin"] or "").strip(),
        "pos_no":        (s["ebarimt_pos_no"] or "").strip(),
        "branch_no":     (s["ebarimt_branch_no"] or "001").strip(),
        "district_code": (s["ebarimt_district_code"] or "").strip(),
        "code_service":  (s["ebarimt_code_service"] or "").strip(),
        "code_shower":   (s["ebarimt_code_shower"] or "").strip(),
        "code_product":  (s["ebarimt_code_product"] or "").strip(),
        "city_tax":      str(s["ebarimt_city_tax"]).lower() == "true",
        "auto_send":     str(s["ebarimt_auto_send"]).lower() == "true",
    }


def validate(conf: dict) -> list:
    """Илгээхэд дутуу талбарууд."""
    missing = []
    if not conf["merchant_tin"]:
        missing.append("ТТД (merchantTin)")
    if conf["mode"] == "posapi" and not conf["url"]:
        missing.append("PosAPI хаяг")
    if len(conf["district_code"]) != 4 or not conf["district_code"].isdigit():
        missing.append("Дүүргийн код (4 оронтой)")
    for key, label in (("code_service", "угаалга"), ("code_shower", "шүршүүр"),
                       ("code_product", "бараа")):
        v = conf[key]
        if len(v) != 7 or not v.isdigit():
            missing.append(f"Ангиллын код — {label} (7 оронтой)")
    return missing


# ── Баримтын бүтэц ─────────────────────────────────────
def _line_has_vat(item, product_vat: bool) -> bool:
    return (item.item_type in ("service", "room")
            or (item.item_type == "product" and product_vat))


def _code_for(item, conf) -> str:
    if item.item_type == "room":
        return conf["code_shower"]
    if item.item_type == "product":
        return conf["code_product"]
    return conf["code_service"]


def _split_taxes(total: Decimal, city: bool):
    """НӨАТ багтсан дүнгээс НӨАТ, НХАТ задлах (Нийт = Үндсэн + НӨАТ + НХАТ)."""
    if city:
        vat = q(total * Decimal(10) / Decimal(112))
        ctx = q(total * Decimal(2) / Decimal(112))
    else:
        vat = q(total * Decimal(10) / Decimal(110))
        ctx = Decimal("0.00")
    return vat, ctx


def _allocate(weights, target: Decimal) -> list:
    """`target`-ийг жингийн дагуу мөнгө (0.01) бүрээр хуваарилна.

    Их үлдэгдлийн арга: эхлээд доош бөөрөнхийлж, үлдсэн мөнгийг хамгийн
    их бутархайтай мөрүүдэд нэг нэгээр өгнө → нийлбэр нь ЯГ target.
    """
    total_w = sum(weights, Decimal("0"))
    if total_w <= 0:
        return [Decimal("0.00")] * len(weights)
    cents = int((target * 100).to_integral_value(ROUND_HALF_UP))
    raw = [w * cents / total_w for w in weights]
    base = [int(r) for r in raw]                       # доош
    left = cents - sum(base)
    order_ = sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)
    for i in order_[:left]:
        base[i] += 1
    return [Decimal(b) / 100 for b in base]


def _split_qty(qty: int, amount: Decimal):
    """qty × unitPrice == totalAmount ЯГ байхаар мөрийг задлана.

    7 ширхэг 4567.89₮ → 6 × 652.56 + 1 × 652.53 (хуваагдахгүй бол).
    """
    unit = q(amount / qty)
    if qty <= 1 or q(unit * qty) == amount:
        return [(qty, q(amount / qty), amount)]
    head = q(unit * (qty - 1))
    tail = amount - head
    return [(qty - 1, unit, head), (1, tail, tail)]


def build(order, conf) -> dict:
    """Захиалгаас PosAPI 3.0-ийн баримтын бүтэц.

    Хямдрал ба оноог мөрүүдэд пропорциональ хуваана — баримт дээрх дүн
    үйлчлүүлэгчийн БОДИТ төлсөн мөнгөтэй мөнгө бүрээр таарах ёстой.
    """
    items = list(order.items or [])
    subtotal = sum((q(i.total_price) for i in items), Decimal("0"))
    paid_total = q(order.total or 0)

    vat_items = [i for i in items if _line_has_vat(i, bool(order.product_vat))]
    vat_sub = sum((q(i.total_price) for i in vat_items), Decimal("0"))
    # НӨАТ-тэй хэсэгт ногдох БОДИТ төлсөн дүн (бүгд НӨАТ-тэй бол = төлсөн дүн)
    target = q(paid_total * vat_sub / subtotal) if subtotal > 0 else Decimal("0")
    amounts = _allocate([q(i.total_price) for i in vat_items], target)

    rows = []
    for it, amount in zip(vat_items, amounts):
        if amount <= 0:
            continue
        name = (it.item_name or (it.service.name if it.service else None)
                or (it.product.name if it.product else None) or "Үйлчилгээ")
        for qty, unit, part in _split_qty(int(it.quantity or 1), amount):
            vat, ctx = _split_taxes(part, conf["city_tax"])
            rows.append({
                "name":               name[:100],
                "barCode":            None,
                "barCodeType":        "UNDEFINED",
                "classificationCode": _code_for(it, conf),
                "taxProductCode":     None,
                "measureUnit":        "ш",
                "qty":                qty,
                "unitPrice":          f(unit),
                "totalBonus":         0,
                "totalVAT":           f(vat),
                "totalCityTax":       f(ctx),
                "totalAmount":        f(part),
            })

    total = sum((q(r["totalAmount"]) for r in rows), Decimal("0"))
    vat   = sum((q(r["totalVAT"]) for r in rows), Decimal("0"))
    city  = sum((q(r["totalCityTax"]) for r in rows), Decimal("0"))

    payload = {
        "branchNo":     conf["branch_no"],
        "totalAmount":  f(total),
        "totalVAT":     f(vat),
        "totalCityTax": f(city),
        "districtCode": conf["district_code"],
        "merchantTin":  conf["merchant_tin"],
        "posNo":        conf["pos_no"],
        "customerTin":  None,
        "consumerNo":   None,
        "type":         "B2C_RECEIPT",
        "inactiveId":   None,
        "reportMonth":  None,
        "receipts": [{
            "totalAmount":  f(total),
            "taxType":      "VAT_ABLE",
            "merchantTin":  conf["merchant_tin"],
            "totalVAT":     f(vat),
            "totalCityTax": f(city),
            "items":        rows,
        }],
        "payments": _payments(order, total),
    }
    return payload


def _payments(order, total: Decimal) -> list:
    """Төлбөрийн хэлбэр — PosAPI 3.0 нь CASH ба PAYMENT_CARD-ыг хүлээн авна.

    Шилжүүлэг, карт → PAYMENT_CARD (бэлэн бус). Холимог төлбөрийг И-Баримтын
    дүнд пропорциональ хуваана (НӨАТ-гүй бараа баримтад ороогүй байж болно).
    """
    if total <= 0:
        return []
    method = order.payment_method or "cash"
    cash = Decimal("0")
    if method == "cash":
        cash = total
    elif method == "mixed" and order.payment_details:
        try:
            d = json.loads(order.payment_details)
            paid = sum(Decimal(str(v)) for v in d.values()) or Decimal("1")
            cash = q(total * Decimal(str(d.get("cash", 0))) / paid)
        except (ValueError, TypeError, ArithmeticError):
            cash = Decimal("0")
    cash = min(cash, total)
    card = q(total - cash)
    out = []
    if cash > 0:
        out.append({"code": "CASH", "status": "PAID", "paidAmount": f(cash)})
    if card > 0:
        out.append({"code": "PAYMENT_CARD", "status": "PAID", "paidAmount": f(card)})
    return out


# ── Симулятор (PosAPI-гүй турших) ──────────────────────
def _simulate(payload: dict) -> dict:
    """PosAPI-ийн хариутай ижил бүтэцтэй ТЕСТ хариу. Татварт илгээгдэхгүй."""
    now = datetime.now()
    rnd = random.Random()
    ddtd = (payload.get("merchantTin") or "0").rjust(11, "0")[-11:] \
        + now.strftime("%y%m%d%H%M%S") + "".join(rnd.choice("0123456789") for _ in range(10))
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return {
        "id":      ddtd[:33],
        "status":  "SUCCESS",
        "message": "",
        "lottery": f"{rnd.choice(letters)}{rnd.choice(letters)} {rnd.randint(0, 99999999):08d}",
        "qrData":  "".join(rnd.choice("0123456789") for _ in range(120)),
        "date":    now.strftime("%Y-%m-%d %H:%M:%S"),
        "simulated": True,
    }


# ── PosAPI дуудлагууд ──────────────────────────────────
class EbarimtError(Exception):
    pass


def _http(method: str, url: str, **kw):
    try:
        r = requests.request(method, url, timeout=TIMEOUT, **kw)
    except requests.ConnectionError:
        raise EbarimtError(
            f"PosAPI-тай холбогдож чадсангүй ({url}). PosAPI ажиллаж байгаа эсэхийг шалгана уу.")
    except requests.Timeout:
        raise EbarimtError("PosAPI хариу өгсөнгүй (хугацаа хэтэрлээ).")
    try:
        data = r.json()
    except ValueError:
        data = {"message": r.text[:300]}
    if r.status_code >= 400:
        msg = data.get("message") if isinstance(data, dict) else None
        raise EbarimtError(f"PosAPI {r.status_code}: {msg or r.text[:300]}")
    return data


def info(conf: dict) -> dict:
    if conf["mode"] == "simulator":
        return {"simulated": True, "operatorName": "ТЕСТ (симулятор)",
                "posNo": conf["pos_no"] or "TEST", "leftLotteries": 9999,
                "lastSentDate": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "merchants": [{"tin": conf["merchant_tin"], "name": "ТЕСТ ХУДАЛДАГЧ"}]}
    return _http("GET", conf["url"] + "/rest/info")


def send_data(conf: dict) -> dict:
    if conf["mode"] == "simulator":
        return {"simulated": True, "message": "Симулятор — илгээх өгөгдөл алга"}
    return _http("GET", conf["url"] + "/rest/sendData")


def create(payload: dict, conf: dict) -> dict:
    if conf["mode"] == "simulator":
        return _simulate(payload)
    return _http("POST", conf["url"] + "/rest/receipt", json=payload)


def void(receipt_id: str, date: str, conf: dict) -> dict:
    if conf["mode"] == "simulator":
        return {"simulated": True, "status": "SUCCESS"}
    return _http("DELETE", conf["url"] + "/rest/receipt",
                 json={"id": receipt_id, "date": date})


# ── Захиалгатай холбох ─────────────────────────────────
def issue(order, db, force: bool = False) -> dict:
    """Захиалгад И-Баримт гаргаж, үр дүнг захиалгад хадгална.

    Алдаа гарсан ч борлуулалтыг ЗОГСООХГҮЙ — ebarimt_status='error' болж,
    «Дахин илгээх» товчоор давтан оролдоно.
    """
    conf = config(db)
    if not conf["enabled"] and not force:
        return {"skipped": "disabled"}
    if not order.is_paid:
        return {"skipped": "unpaid"}
    if order.ebarimt_status == "success":
        return {"skipped": "already"}

    missing = validate(conf)
    if missing:
        order.ebarimt_status = "error"
        order.ebarimt_error = "Тохиргоо дутуу: " + ", ".join(missing)
        db.commit()
        return {"error": order.ebarimt_error}

    payload = build(order, conf)
    if payload["totalAmount"] <= 0:
        order.ebarimt_status = "none"      # НӨАТ-тэй мөр алга — баримт шаардахгүй
        order.ebarimt_error = None
        db.commit()
        return {"skipped": "no_vat_lines"}

    try:
        res = create(payload, conf)
    except EbarimtError as e:
        order.ebarimt_status = "error"
        order.ebarimt_error = str(e)[:500]
        db.commit()
        return {"error": order.ebarimt_error}

    if str(res.get("status", "")).upper() != "SUCCESS" or not res.get("id"):
        order.ebarimt_status = "error"
        order.ebarimt_error = (res.get("message") or "PosAPI амжилтгүй хариу өглөө")[:500]
        db.commit()
        return {"error": order.ebarimt_error}

    order.ebarimt_id      = res["id"]
    order.ebarimt_lottery = res.get("lottery")
    order.ebarimt_qr      = res.get("qrData")
    order.ebarimt_date    = res.get("date")
    order.ebarimt_amount  = payload["totalAmount"]
    order.ebarimt_vat     = payload["totalVAT"]
    order.ebarimt_test    = bool(res.get("simulated"))
    order.ebarimt_status  = "success"
    order.ebarimt_error   = None
    db.commit()
    return {"ok": True, "id": order.ebarimt_id}


def cancel(order, db) -> dict:
    """Захиалга устгахад И-Баримтыг буцаана."""
    if order.ebarimt_status != "success" or not order.ebarimt_id:
        return {"skipped": True}
    conf = config(db)
    try:
        void(order.ebarimt_id, order.ebarimt_date or "", conf)
    except EbarimtError as e:
        # Буцаалт бүтэлгүйтвэл захиалгыг устгахыг хориглохгүй, гэхдээ
        # тэмдэглэнэ — нягтлан гараар буцаана.
        order.ebarimt_error = ("Буцаалт амжилтгүй: " + str(e))[:500]
        db.commit()
        return {"error": order.ebarimt_error}
    order.ebarimt_status = "returned"
    db.commit()
    return {"ok": True}
