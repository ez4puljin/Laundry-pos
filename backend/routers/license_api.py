"""Лицензийн API — нэвтрэлтгүй хандана.

Систем түгжигдсэн үед хэрэглэгч нэвтэрч чадахгүй тул эдгээр цэг нь
заавал нээлттэй байх ёстой. Оронд нь оролдлогын тоог core.py дотор
экспоненциалаар хязгаарладаг.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import licensing

router = APIRouter(prefix="/license", tags=["license"])


class LicenseStatus(BaseModel):
    state: str
    ok: bool
    mode: Optional[str] = None
    days_left: int = 0
    expires_at: Optional[int] = None
    machine_code: str = ""
    message: str = ""
    retry_after: int = 0


class ActivateRequest(BaseModel):
    mode: str = Field(default="trial", pattern="^(trial|full)$")
    days: int = Field(default=7, ge=1, le=3650)
    password: Optional[str] = None
    key: Optional[str] = None


@router.get("/status", response_model=LicenseStatus)
def get_status():
    return LicenseStatus(**licensing.status())


@router.post("/activate", response_model=LicenseStatus)
def activate(payload: ActivateRequest):
    if not payload.password and not payload.key:
        raise HTTPException(
            status_code=400,
            detail="Мастер нууц үг эсвэл идэвхжүүлэх түлхүүр оруулна уу",
        )
    try:
        result = licensing.activate(
            mode=payload.mode,
            days=payload.days,
            password=payload.password or None,
            key=payload.key or None,
        )
    except licensing.LicenseError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return LicenseStatus(**result)
