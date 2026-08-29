"""Салбарын тохиргоо — салбар БҮР өөрийн утгатай.

Өмнө нь .env файлд глобалаар хадгалагддаг байсан. Олон салбартай болсон
тул салбарын DB-ийн `app_settings` (key/value) хүснэгт рүү шилжүүлэв:
байгууллагын нэр, баримтын загвар, оноо, SMS — бүгд салбар тусдаа.

.env нь зөвхөн СИСТЕМИЙН зүйлсийг (SECRET_KEY г.м) хадгална. Анх нэг
удаа .env-ийн утгуудыг салбар руу хуулж авна (seed_from_env) — одоо
ажиллаж буй суулгац тохиргоогоо алдахгүй.
"""
import os

from sqlalchemy.orm import Session

from models import AppSetting

# ── Анхны утгууд ───────────────────────────────────────
DEFAULTS = {
    # Байгууллага / системийн нэр
    "brand_name":  "Цэмбий Laundry угаалга",
    "brand_short": "Цэмбий",
    "brand_desc":  "Угаалгын үйлчилгээний удирдлагын систем",
    # Баримтын загвар («» = байгууллагын нэрийг том үсгээр ашиглана)
    "receipt_shop_name":   "",
    "receipt_shop_desc":   "Угаалгын үйлчилгээ",
    "receipt_shop_phone":  "9900-0000",
    "receipt_footer_text": "Баярлалаа!",
    "receipt_footer_sub":  "Дахин ирнэ үү",
    # Оноо
    "points_enabled":   "true",
    "points_earn_rate": "1.0",
    # SMS
    "sms_gateway_url":      "",
    "sms_gateway_username": "",
    "sms_gateway_password": "",
    "sms_enabled":          "true",
    "sms_template":         "",
}

# .env-ийн нэр ↔ тохиргооны түлхүүр (анхны шилжүүлэлтэд)
_ENV_MAP = {
    "BRAND_NAME":           "brand_name",
    "BRAND_SHORT":          "brand_short",
    "BRAND_DESC":           "brand_desc",
    "RECEIPT_SHOP_NAME":    "receipt_shop_name",
    "RECEIPT_SHOP_DESC":    "receipt_shop_desc",
    "RECEIPT_SHOP_PHONE":   "receipt_shop_phone",
    "RECEIPT_FOOTER_TEXT":  "receipt_footer_text",
    "RECEIPT_FOOTER_SUB":   "receipt_footer_sub",
    "POINTS_ENABLED":       "points_enabled",
    "POINTS_EARN_RATE":     "points_earn_rate",
    "SMS_GATEWAY_URL":      "sms_gateway_url",
    "SMS_GATEWAY_USERNAME": "sms_gateway_username",
    "SMS_GATEWAY_PASSWORD": "sms_gateway_password",
    "SMS_ENABLED":          "sms_enabled",
    "SMS_TEMPLATE":         "sms_template",
}


# ── Унших ──────────────────────────────────────────────
def get_all(db: Session) -> dict:
    """Бүх тохиргоо — хадгалаагүйг нь анхны утгаар нөхнө."""
    values = dict(DEFAULTS)
    for row in db.query(AppSetting).all():
        if row.value is not None:
            values[row.key] = row.value
    return values


def get(db: Session, key: str, default=None) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is not None and row.value is not None:
        return row.value
    return DEFAULTS.get(key, default)


def get_bool(db: Session, key: str) -> bool:
    return str(get(db, key, "false")).strip().lower() == "true"


def get_float(db: Session, key: str, default: float = 0.0) -> float:
    try:
        return float(get(db, key, str(default)))
    except (TypeError, ValueError):
        return default


# ── Бичих ──────────────────────────────────────────────
def set_many(db: Session, values: dict) -> None:
    rows = {r.key: r for r in db.query(AppSetting).all()}
    for key, val in values.items():
        text = "" if val is None else str(val)
        row = rows.get(key)
        if row is None:
            db.add(AppSetting(key=key, value=text))
        else:
            row.value = text
    db.commit()


# ── Анхны шилжүүлэлт ───────────────────────────────────
def seed_from_env(db: Session) -> None:
    """Хоосон салбарт .env-ийн (эсвэл анхны) утгуудыг суулгана.

    Нэг ч тохиргоо хадгалагдаагүй байвал л ажиллана — дараа нь админ
    юу тохируулсныг дарж бичихгүй.
    """
    if db.query(AppSetting).count() > 0:
        return
    values = dict(DEFAULTS)
    for env_key, key in _ENV_MAP.items():
        raw = os.getenv(env_key)
        if raw not in (None, ""):
            values[key] = raw
    set_many(db, values)


# ── Бусад модульд зориулсан хэлбэрүүд ──────────────────
def sms_config(db: Session) -> dict:
    """sms_service-д дамжуулах тохиргоо (салбарын өөрийн gateway)."""
    return {
        "url":      get(db, "sms_gateway_url") or "http://192.168.1.71:8080",
        "username": get(db, "sms_gateway_username") or "sms",
        "password": get(db, "sms_gateway_password") or "",
        "enabled":  get_bool(db, "sms_enabled"),
        "template": get(db, "sms_template")
                    or "Таны угаалга бэлэн боллоо. {brand}".format(
                        brand=get(db, "brand_name")),
    }
