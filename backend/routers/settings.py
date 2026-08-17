from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
import os
from pathlib import Path
from dotenv import load_dotenv, set_key
from auth import require_admin

router = APIRouter(prefix="/settings", tags=["settings"])
# Нэвтрэлтгүй хандах хэсэг — нэвтрэх хуудас, ТВ дэлгэц системийн нэрийг унших
public_router = APIRouter(prefix="/public", tags=["settings"])

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# ── Байгууллага / системийн нэр ────────────────────────
DEFAULT_BRAND_NAME  = "Цэмбий Laundry угаалга"
DEFAULT_BRAND_SHORT = "Цэмбий"
DEFAULT_BRAND_DESC  = "Угаалгын үйлчилгээний удирдлагын систем"


class BrandSettings(BaseModel):
    brand_name:  str = DEFAULT_BRAND_NAME    # бүтэн нэр — нэвтрэх хуудас, ТВ, баримт
    brand_short: str = DEFAULT_BRAND_SHORT   # богино нэр — хажуугийн цэс, лого
    brand_desc:  str = DEFAULT_BRAND_DESC    # тайлбар — нэвтрэх хуудасны дэд гарчиг


def _brand_name() -> str:
    """Тохируулсан системийн нэр (баримтын анхны утга болно)."""
    return os.getenv("BRAND_NAME") or DEFAULT_BRAND_NAME


@public_router.get("/brand", response_model=BrandSettings)
def get_brand_settings():
    """Нэвтрэлтгүй — нэвтрэх хуудас болон ТВ дэлгэц ашиглана."""
    load_dotenv(ENV_PATH, override=True)
    return BrandSettings(
        brand_name  = _brand_name(),
        brand_short = os.getenv("BRAND_SHORT") or DEFAULT_BRAND_SHORT,
        brand_desc  = os.getenv("BRAND_DESC")  or DEFAULT_BRAND_DESC,
    )


@router.put("/brand", response_model=BrandSettings, dependencies=[Depends(require_admin)])
def update_brand_settings(payload: BrandSettings):
    if not ENV_PATH.exists():
        ENV_PATH.touch()

    name  = payload.brand_name.strip()  or DEFAULT_BRAND_NAME
    short = payload.brand_short.strip() or name
    desc  = payload.brand_desc.strip()

    set_key(str(ENV_PATH), "BRAND_NAME",  name)
    set_key(str(ENV_PATH), "BRAND_SHORT", short)
    set_key(str(ENV_PATH), "BRAND_DESC",  desc)

    load_dotenv(ENV_PATH, override=True)
    return BrandSettings(brand_name=name, brand_short=short, brand_desc=desc)


class SmsSettings(BaseModel):
    sms_gateway_url: str = ""
    sms_gateway_username: str = ""
    sms_gateway_password: str = ""
    sms_enabled: bool = True
    sms_template: str = ""


@router.get("/sms", response_model=SmsSettings)
def get_sms_settings():
    load_dotenv(ENV_PATH, override=True)
    return SmsSettings(
        sms_gateway_url=os.getenv("SMS_GATEWAY_URL", ""),
        sms_gateway_username=os.getenv("SMS_GATEWAY_USERNAME", ""),
        sms_gateway_password=os.getenv("SMS_GATEWAY_PASSWORD", ""),
        sms_enabled=os.getenv("SMS_ENABLED", "true").lower() == "true",
        sms_template=os.getenv("SMS_TEMPLATE", ""),
    )


@router.put("/sms", response_model=SmsSettings, dependencies=[Depends(require_admin)])
def update_sms_settings(payload: SmsSettings):
    # Ensure .env exists
    if not ENV_PATH.exists():
        ENV_PATH.touch()

    set_key(str(ENV_PATH), "SMS_GATEWAY_URL", payload.sms_gateway_url)
    set_key(str(ENV_PATH), "SMS_GATEWAY_USERNAME", payload.sms_gateway_username)
    set_key(str(ENV_PATH), "SMS_GATEWAY_PASSWORD", payload.sms_gateway_password)
    set_key(str(ENV_PATH), "SMS_ENABLED", str(payload.sms_enabled).lower())
    set_key(str(ENV_PATH), "SMS_TEMPLATE", payload.sms_template)

    # Reload into current process environment
    load_dotenv(ENV_PATH, override=True)

    return payload


# ── Points / Loyalty settings ──────────────────────────
class PointsSettings(BaseModel):
    points_enabled: bool = True
    points_earn_rate: float = 1.0    # Нийт дүнгийн хэдэн % оноо хуримтлуулах


@router.get("/points", response_model=PointsSettings)
def get_points_settings():
    load_dotenv(ENV_PATH, override=True)
    return PointsSettings(
        points_enabled=os.getenv("POINTS_ENABLED", "true").lower() == "true",
        points_earn_rate=float(os.getenv("POINTS_EARN_RATE", "1.0")),
    )


@router.put("/points", response_model=PointsSettings, dependencies=[Depends(require_admin)])
def update_points_settings(payload: PointsSettings):
    if not ENV_PATH.exists():
        ENV_PATH.touch()

    set_key(str(ENV_PATH), "POINTS_ENABLED", str(payload.points_enabled).lower())
    set_key(str(ENV_PATH), "POINTS_EARN_RATE", str(payload.points_earn_rate))

    load_dotenv(ENV_PATH, override=True)
    return payload


# ── Receipt template settings ─────────────────────────
class ReceiptSettings(BaseModel):
    shop_name: str = "ЦЭМБИЙ LAUNDRY"
    shop_desc: str = "Угаалгын үйлчилгээ"
    shop_phone: str = "9900-0000"
    footer_text: str = "Баярлалаа!"
    footer_sub: str = "Дахин ирнэ үү"


@router.get("/receipt", response_model=ReceiptSettings)
def get_receipt_settings():
    load_dotenv(ENV_PATH, override=True)
    return ReceiptSettings(
        # Тусад нь тохируулаагүй бол системийн нэрийг ашиглана
        shop_name=os.getenv("RECEIPT_SHOP_NAME") or _brand_name().upper(),
        shop_desc=os.getenv("RECEIPT_SHOP_DESC", "Угаалгын үйлчилгээ"),
        shop_phone=os.getenv("RECEIPT_SHOP_PHONE", "9900-0000"),
        footer_text=os.getenv("RECEIPT_FOOTER_TEXT", "Баярлалаа!"),
        footer_sub=os.getenv("RECEIPT_FOOTER_SUB", "Дахин ирнэ үү"),
    )


@router.put("/receipt", response_model=ReceiptSettings, dependencies=[Depends(require_admin)])
def update_receipt_settings(payload: ReceiptSettings):
    if not ENV_PATH.exists():
        ENV_PATH.touch()

    set_key(str(ENV_PATH), "RECEIPT_SHOP_NAME", payload.shop_name)
    set_key(str(ENV_PATH), "RECEIPT_SHOP_DESC", payload.shop_desc)
    set_key(str(ENV_PATH), "RECEIPT_SHOP_PHONE", payload.shop_phone)
    set_key(str(ENV_PATH), "RECEIPT_FOOTER_TEXT", payload.footer_text)
    set_key(str(ENV_PATH), "RECEIPT_FOOTER_SUB", payload.footer_sub)

    load_dotenv(ENV_PATH, override=True)
    return payload
