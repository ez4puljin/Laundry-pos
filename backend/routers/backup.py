"""Нөөшлөлтийн удирдлага — зөвхөн админ.

· Гараар нөөцлөх, компьютер лүү татаж авах, устгах
· Автомат нөөшлөлт (өдөр бүр) — тохируулгыг салбар бус СИСТЕМИЙН
  хэмжээнд central.db-д хадгална, учир нь нөөц нь бүх салбарыг хамарна
· Нөөцөөс сэргээх — аюулгүйн нөөц автоматаар үүсгэсний дараа
"""
import os
import shutil
import tempfile
import threading
import time
from typing import List, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import Session

import backup_store
import central
import models
from auth import require_admin
from central import CentralBase, CentralSession, central_db
from database import get_db

router = APIRouter(prefix="/backup", tags=["backup"])

# Сэргээхийг санамсаргүй дарахаас сэргийлэх үг
RESTORE_CONFIRM = "СЭРГЭЭХ"


# ── Тохиргоо (central.db) ──────────────────────────────
class BackupSetting(CentralBase):
    __tablename__ = "backup_settings"
    key   = Column(String(40), primary_key=True)
    value = Column(Text, nullable=True)


DEFAULTS = {
    "auto_enabled":  "true",
    "interval_hours": "24",     # хэдэн цаг тутам
    "keep":           "14",     # хэдэн нөөц хадгалах
}


def _get(db: Session, key: str) -> str:
    row = db.query(BackupSetting).filter(BackupSetting.key == key).first()
    return row.value if row and row.value is not None else DEFAULTS[key]


def _conf() -> dict:
    db = CentralSession()
    try:
        return {
            "auto_enabled":   _get(db, "auto_enabled").lower() == "true",
            "interval_hours": max(1, int(float(_get(db, "interval_hours")))),
            "keep":           max(1, int(float(_get(db, "keep")))),
        }
    except (ValueError, TypeError):
        return {"auto_enabled": True, "interval_hours": 24, "keep": 14}
    finally:
        db.close()


class BackupConfig(BaseModel):
    auto_enabled:   bool = True
    interval_hours: int = 24
    keep:           int = 14


class BackupInfo(BaseModel):
    name:       str
    bytes:      int
    created_at: str
    note:       str = ""
    branches:   List[dict] = []
    broken:     bool = False


# ── Жагсаалт / тохиргоо ────────────────────────────────
@router.get("/")
def list_backups(_: models.User = Depends(require_admin)):
    conf = _conf()
    return {
        "backups": backup_store.list_all(),
        "config":  conf,
        "last_age_hours": backup_store.latest_age_hours(),
        "dir": backup_store.BACKUP_DIR,
    }


@router.put("/config", response_model=BackupConfig)
def update_config(payload: BackupConfig,
                  db: Session = Depends(central_db),
                  _: models.User = Depends(require_admin)):
    values = {
        "auto_enabled":   str(payload.auto_enabled).lower(),
        "interval_hours": str(max(1, payload.interval_hours)),
        "keep":           str(max(1, payload.keep)),
    }
    rows = {r.key: r for r in db.query(BackupSetting).all()}
    for k, v in values.items():
        if k in rows:
            rows[k].value = v
        else:
            db.add(BackupSetting(key=k, value=v))
    db.commit()
    return payload


# ── Үүсгэх / татах / устгах ────────────────────────────
@router.post("/create")
def create_backup(note: str = Form(""),
                  _: models.User = Depends(require_admin)):
    """Бүх салбарын өгөгдлийг нэг ZIP болгоно."""
    try:
        info = backup_store.create(note=note)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Нөөцлөхөд алдаа гарлаа: {e}")
    backup_store.prune(_conf()["keep"])
    return info


@router.get("/download/{name}")
def download_backup(name: str, _: models.User = Depends(require_admin)):
    try:
        path = backup_store.path_of(name)
    except (FileNotFoundError, OSError):
        raise HTTPException(status_code=404, detail="Нөөц олдсонгүй")
    return FileResponse(path, media_type="application/zip",
                        filename=os.path.basename(path))


@router.delete("/{name}")
def delete_backup(name: str, _: models.User = Depends(require_admin)):
    try:
        backup_store.remove(name)
    except (FileNotFoundError, OSError):
        raise HTTPException(status_code=404, detail="Нөөц олдсонгүй")
    return {"message": "Нөөц устлаа"}


# ── Сэргээх ────────────────────────────────────────────
@router.post("/inspect")
async def inspect_upload(file: UploadFile = File(...),
                         _: models.User = Depends(require_admin)):
    """Байршуулсан файлын агуулгыг сэргээхийн ӨМНӨ харуулна."""
    tmp = await _save_upload(file)
    try:
        return backup_store.inspect(tmp)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        _cleanup(tmp)


@router.post("/restore")
async def restore_backup(confirm: str = Form(...),
                         name: Optional[str] = Form(None),
                         file: Optional[UploadFile] = File(None),
                         db: Session = Depends(get_db),
                         _: models.User = Depends(require_admin)):
    """Нөөцөөс сэргээнэ — ОДООГИЙН БҮХ ӨГӨГДЛИЙГ дарж бичнэ.

    `name` — сервер дээрх нөөц, эсвэл `file` — компьютерээс байршуулсан ZIP.
    """
    # Энэ хүсэлт өөрөө нэвтрэлт шалгахдаа салбарын DB-г нээсэн байдаг.
    # Windows дээр нээлттэй файлыг солих боломжгүй тул эхлээд чөлөөлнө.
    db.close()

    if confirm.strip().upper() != RESTORE_CONFIRM:
        raise HTTPException(
            status_code=400,
            detail=f"Баталгаажуулахын тулд «{RESTORE_CONFIRM}» гэж бичнэ үү")

    tmp = None
    try:
        if file is not None and file.filename:
            path = tmp = await _save_upload(file)
        elif name:
            path = backup_store.path_of(name)
        else:
            raise HTTPException(status_code=400, detail="Нөөц заагаагүй байна")

        result = backup_store.restore(path)
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Нөөц олдсонгүй")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Сэргээхэд алдаа гарлаа: {e}")
    finally:
        _cleanup(tmp)

    return {
        "message": "Өгөгдөл сэргээгдлээ. Хуудсаа дахин ачаална уу.",
        **result,
    }


async def _save_upload(file: UploadFile) -> str:
    fd, tmp = tempfile.mkstemp(suffix=".zip", prefix="laundry-up-")
    with os.fdopen(fd, "wb") as out:
        while chunk := await file.read(1 << 20):
            out.write(chunk)
    return tmp


def _cleanup(path) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


# ── Автомат нөөшлөлт ───────────────────────────────────
_auto_thread = None
_stop = threading.Event()


def _auto_loop():
    """Цаг тутам шалгаж, хугацаа болсон бол нөөцлөнө."""
    while not _stop.wait(60):          # эхний шалгалт 1 минутын дараа
        try:
            conf = _conf()
            if not conf["auto_enabled"]:
                _stop.wait(3600)
                continue
            age = backup_store.latest_age_hours()
            if age is None or age >= conf["interval_hours"]:
                backup_store.create(note="Автомат нөөшлөлт")
                backup_store.prune(conf["keep"])
        except Exception:
            pass                       # нөөц бүтэлгүйтвэл системийг зогсоохгүй
        _stop.wait(3600)


def start_auto_backup() -> None:
    global _auto_thread
    CentralBase.metadata.create_all(bind=central.central_engine)
    if _auto_thread is None or not _auto_thread.is_alive():
        _stop.clear()
        _auto_thread = threading.Thread(target=_auto_loop, daemon=True,
                                        name="auto-backup")
        _auto_thread.start()


def stop_auto_backup() -> None:
    _stop.set()
