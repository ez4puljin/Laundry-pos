"""Салбарын тохиргоо.

Байгууллагын нэр, баримтын загвар, оноо, SMS — САЛБАР тус бүрд тусдаа
хадгалагдана (settings_store → салбарын DB). Нэвтрэх хуудас сонгосон
салбарынхаа нэрийг харуулахын тулд `/public/brand` нь X-Branch толгойг
дагана.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import settings_store
from auth import require_admin
from database import get_db

router = APIRouter(prefix="/settings", tags=["settings"])
# Нэвтрэлтгүй хандах хэсэг — нэвтрэх хуудас, ТВ дэлгэц системийн нэрийг унших
public_router = APIRouter(prefix="/public", tags=["settings"])

D = settings_store.DEFAULTS


# ── Байгууллага / системийн нэр ────────────────────────
class BrandSettings(BaseModel):
    brand_name:  str = D["brand_name"]    # бүтэн нэр — нэвтрэх хуудас, ТВ, баримт
    brand_short: str = D["brand_short"]   # богино нэр — хажуугийн цэс, лого
    brand_desc:  str = D["brand_desc"]    # тайлбар — нэвтрэх хуудасны дэд гарчиг


@public_router.get("/brand", response_model=BrandSettings)
def get_brand_settings(db: Session = Depends(get_db)):
    """Нэвтрэлтгүй — нэвтрэх хуудас болон ТВ дэлгэц ашиглана.

    X-Branch толгойгоор аль салбарынхыг харуулахыг заана.
    """
    s = settings_store.get_all(db)
    return BrandSettings(
        brand_name  = s["brand_name"]  or D["brand_name"],
        brand_short = s["brand_short"] or D["brand_short"],
        brand_desc  = s["brand_desc"],
    )


@router.put("/brand", response_model=BrandSettings, dependencies=[Depends(require_admin)])
def update_brand_settings(payload: BrandSettings, db: Session = Depends(get_db)):
    name  = payload.brand_name.strip()  or D["brand_name"]
    short = payload.brand_short.strip() or name
    desc  = payload.brand_desc.strip()

    settings_store.set_many(db, {
        "brand_name": name, "brand_short": short, "brand_desc": desc,
    })
    return BrandSettings(brand_name=name, brand_short=short, brand_desc=desc)


# ── SMS Gateway ────────────────────────────────────────
class SmsSettings(BaseModel):
    sms_gateway_url: str = ""
    sms_gateway_username: str = ""
    sms_gateway_password: str = ""
    sms_enabled: bool = True
    sms_template: str = ""


@router.get("/sms", response_model=SmsSettings)
def get_sms_settings(db: Session = Depends(get_db)):
    s = settings_store.get_all(db)
    return SmsSettings(
        sms_gateway_url      = s["sms_gateway_url"],
        sms_gateway_username = s["sms_gateway_username"],
        sms_gateway_password = s["sms_gateway_password"],
        sms_enabled          = str(s["sms_enabled"]).lower() == "true",
        sms_template         = s["sms_template"],
    )


@router.put("/sms", response_model=SmsSettings, dependencies=[Depends(require_admin)])
def update_sms_settings(payload: SmsSettings, db: Session = Depends(get_db)):
    settings_store.set_many(db, {
        "sms_gateway_url":      payload.sms_gateway_url,
        "sms_gateway_username": payload.sms_gateway_username,
        "sms_gateway_password": payload.sms_gateway_password,
        "sms_enabled":          str(payload.sms_enabled).lower(),
        "sms_template":         payload.sms_template,
    })
    return payload


# ── Оноо (Loyalty) ─────────────────────────────────────
class PointsSettings(BaseModel):
    points_enabled: bool = True
    points_earn_rate: float = 1.0    # Нийт дүнгийн хэдэн % оноо хуримтлуулах


@router.get("/points", response_model=PointsSettings)
def get_points_settings(db: Session = Depends(get_db)):
    return PointsSettings(
        points_enabled   = settings_store.get_bool(db, "points_enabled"),
        points_earn_rate = settings_store.get_float(db, "points_earn_rate", 1.0),
    )


@router.put("/points", response_model=PointsSettings, dependencies=[Depends(require_admin)])
def update_points_settings(payload: PointsSettings, db: Session = Depends(get_db)):
    settings_store.set_many(db, {
        "points_enabled":   str(payload.points_enabled).lower(),
        "points_earn_rate": payload.points_earn_rate,
    })
    return payload


# ── Баримтын загвар ────────────────────────────────────
class ReceiptSettings(BaseModel):
    shop_name: str = "ЦЭМБИЙ LAUNDRY"
    shop_desc: str = D["receipt_shop_desc"]
    shop_phone: str = D["receipt_shop_phone"]
    footer_text: str = D["receipt_footer_text"]
    footer_sub: str = D["receipt_footer_sub"]


@router.get("/receipt", response_model=ReceiptSettings)
def get_receipt_settings(db: Session = Depends(get_db)):
    s = settings_store.get_all(db)
    return ReceiptSettings(
        # Тусад нь тохируулаагүй бол салбарын нэрийг ашиглана
        shop_name   = s["receipt_shop_name"] or (s["brand_name"] or D["brand_name"]).upper(),
        shop_desc   = s["receipt_shop_desc"],
        shop_phone  = s["receipt_shop_phone"],
        footer_text = s["receipt_footer_text"],
        footer_sub  = s["receipt_footer_sub"],
    )


@router.put("/receipt", response_model=ReceiptSettings, dependencies=[Depends(require_admin)])
def update_receipt_settings(payload: ReceiptSettings, db: Session = Depends(get_db)):
    settings_store.set_many(db, {
        "receipt_shop_name":   payload.shop_name,
        "receipt_shop_desc":   payload.shop_desc,
        "receipt_shop_phone":  payload.shop_phone,
        "receipt_footer_text": payload.footer_text,
        "receipt_footer_sub":  payload.footer_sub,
    })
    return payload
