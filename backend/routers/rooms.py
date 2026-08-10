from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from database import SessionLocal
from auth import get_current_user, require_admin
import models
import schemas

_LOCAL_TZ = timezone(timedelta(hours=8))
def _now_local():
    return datetime.now(_LOCAL_TZ)

def _today_start():
    return _now_local().replace(hour=0, minute=0, second=0, microsecond=0)


# 4 router: public самбарыг нэвтрэлтгүй mount хийх боломжтой байхын тулд тусад нь
types_router    = APIRouter(prefix="/room-types",    tags=["rooms"])
router          = APIRouter(prefix="/rooms",         tags=["rooms"])
sessions_router = APIRouter(prefix="/room-sessions", tags=["rooms"])
public_router   = APIRouter(prefix="/public",        tags=["rooms"])   # нэвтрэлтгүй


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _active_session(room_id: int, db: Session) -> Optional[models.RoomSession]:
    """Өрөөг эзэлж буй session (байвал)."""
    return (
        db.query(models.RoomSession)
        .filter(
            models.RoomSession.room_id == room_id,
            models.RoomSession.status.in_(models.ROOM_OCCUPYING_STATUSES),
        )
        .first()
    )


def _room_out(room: models.Room, db: Session) -> dict:
    """Room-ийг active_session-тай dict болгоно (machines-ийн _machine_out жишгээр)."""
    return {
        "id": room.id,
        "number": room.number,
        "room_type_id": room.room_type_id,
        "is_active": room.is_active,
        "map_x": room.map_x,
        "map_y": room.map_y,
        "map_w": room.map_w,
        "map_h": room.map_h,
        "room_type": room.room_type,
        "active_session": _active_session(room.id, db),
    }


def _clean_number(raw: str) -> str:
    """Өрөөний дугаарыг цэвэрлэнэ — UI өөрөө «№» тэмдгийг нэмдэг тул давхардуулахгүй."""
    n = (raw or "").strip().lstrip("№#").strip()
    if not n:
        raise HTTPException(400, "Өрөөний дугаар оруулна уу")
    return n


def _deny_cleaner(current_user):
    """Кассын үйлдлүүдийг үйлчлэгчид хаана."""
    if current_user.role == "cleaner":
        raise HTTPException(403, "Зөвхөн кассчин эсвэл админ")


def _transition(room_id: int, expected: str, error: str, db: Session) -> models.RoomSession:
    """Өрөөний идэвхтэй session-ийг статусаар нь шалгаж буцаана."""
    room = db.query(models.Room).get(room_id)
    if not room:
        raise HTTPException(404, "Өрөө олдсонгүй")
    session = _active_session(room_id, db)
    if not session:
        raise HTTPException(400, "Энэ өрөөнд идэвхтэй захиалга алга")
    if session.status != expected:
        raise HTTPException(400, error)
    return session


# ═══════════════════════════════════════════════════════════
#  Өрөөний төрөл (Room types)
# ═══════════════════════════════════════════════════════════
@types_router.get("/", response_model=List[schemas.RoomTypeOut])
def list_room_types(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.RoomType)
    if active_only:
        q = q.filter(models.RoomType.is_active == True)
    return q.order_by(models.RoomType.sort_order, models.RoomType.id).all()


@types_router.post("/", response_model=schemas.RoomTypeOut)
def create_room_type(
    data: schemas.RoomTypeCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    rt = models.RoomType(**data.model_dump())
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return rt


@types_router.put("/{type_id}", response_model=schemas.RoomTypeOut)
def update_room_type(
    type_id: int,
    data: schemas.RoomTypeUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    rt = db.query(models.RoomType).get(type_id)
    if not rt:
        raise HTTPException(404, "Өрөөний төрөл олдсонгүй")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(rt, field, value)
    db.commit()
    db.refresh(rt)
    return rt


@types_router.delete("/{type_id}")
def delete_room_type(
    type_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    rt = db.query(models.RoomType).get(type_id)
    if not rt:
        raise HTTPException(404, "Өрөөний төрөл олдсонгүй")
    active_rooms = db.query(models.Room).filter(
        models.Room.room_type_id == type_id,
        models.Room.is_active == True,
    ).count()
    if active_rooms:
        raise HTTPException(400, "Энэ төрөлд бүртгэлтэй идэвхтэй өрөө байна")
    rt.is_active = False
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════
#  Өрөө (Rooms)
# ═══════════════════════════════════════════════════════════
@router.get("/", response_model=List[schemas.RoomOut])
def list_rooms(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Room)
    if active_only:
        q = q.filter(models.Room.is_active == True)
    rooms = q.order_by(models.Room.id).all()
    return [_room_out(r, db) for r in rooms]


@router.post("/", response_model=schemas.RoomOut)
def create_room(
    data: schemas.RoomCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    number = _clean_number(data.number)
    if db.query(models.Room).filter(models.Room.number == number).first():
        raise HTTPException(400, "Энэ дугаартай өрөө аль хэдийн байна")
    if not db.query(models.RoomType).get(data.room_type_id):
        raise HTTPException(404, "Өрөөний төрөл олдсонгүй")
    room = models.Room(number=number, room_type_id=data.room_type_id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return _room_out(room, db)


# ⚠ /rooms/layout нь /rooms/{room_id}-ээс ӨМНӨ бүртгэгдэх ёстой
@router.put("/layout", response_model=List[schemas.RoomOut])
def save_layout(
    data: schemas.RoomLayoutUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Зураглалын байрлалуудыг нэг дор хадгална."""
    for item in data.items:
        room = db.query(models.Room).get(item.id)
        if not room:
            continue
        room.map_x = item.map_x
        room.map_y = item.map_y
        room.map_w = item.map_w
        room.map_h = item.map_h
    db.commit()
    rooms = db.query(models.Room).order_by(models.Room.id).all()
    return [_room_out(r, db) for r in rooms]


@router.put("/{room_id}", response_model=schemas.RoomOut)
def update_room(
    room_id: int,
    data: schemas.RoomUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    room = db.query(models.Room).get(room_id)
    if not room:
        raise HTTPException(404, "Өрөө олдсонгүй")
    if data.number is not None:
        number = _clean_number(data.number)
        if number != room.number:
            if db.query(models.Room).filter(models.Room.number == number).first():
                raise HTTPException(400, "Энэ дугаартай өрөө аль хэдийн байна")
            room.number = number
    if data.room_type_id is not None:
        if not db.query(models.RoomType).get(data.room_type_id):
            raise HTTPException(404, "Өрөөний төрөл олдсонгүй")
        room.room_type_id = data.room_type_id
    if data.is_active is not None:
        if not data.is_active and _active_session(room_id, db):
            raise HTTPException(400, "Өрөө ашиглалтад байна")
        room.is_active = data.is_active
    db.commit()
    db.refresh(room)
    return _room_out(room, db)


@router.delete("/{room_id}")
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    room = db.query(models.Room).get(room_id)
    if not room:
        raise HTTPException(404, "Өрөө олдсонгүй")
    if _active_session(room_id, db):
        raise HTTPException(400, "Өрөө ашиглалтад байна")
    room.is_active = False
    db.commit()
    return {"ok": True}


# ── Статусын шилжилтүүд ────────────────────────────────────
@router.post("/{room_id}/start", response_model=schemas.RoomOut)
def start_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Үйлчлүүлэгч орлоо → хугацаа тоологдож эхэлнэ."""
    _deny_cleaner(current_user)
    session = _transition(room_id, "reserved", "Өрөө аль хэдийн эхэлсэн байна", db)
    session.status = "in_use"
    session.started_at = _now_local()
    db.commit()
    return _room_out(db.query(models.Room).get(room_id), db)


@router.post("/{room_id}/finish", response_model=schemas.RoomOut)
def finish_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Үйлчлүүлэгч гарлаа → цэвэрлэгээ хүлээнэ."""
    session = _transition(room_id, "in_use", "Өрөө ашиглагдаж байгаагүй", db)
    session.status = "awaiting_cleaning"
    session.ended_at = _now_local()
    db.commit()
    return _room_out(db.query(models.Room).get(room_id), db)


@router.post("/{room_id}/cleaning-start", response_model=schemas.RoomOut)
def cleaning_start(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Үйлчлэгч цэвэрлэж эхэллээ."""
    session = _transition(room_id, "awaiting_cleaning", "Цэвэрлэгээ хүлээгдээгүй байна", db)
    session.status = "cleaning"
    session.cleaning_started_at = _now_local()
    session.cleaned_by_id = current_user.id
    session.cleaned_by = current_user.full_name
    db.commit()
    return _room_out(db.query(models.Room).get(room_id), db)


@router.post("/{room_id}/cleaning-done", response_model=schemas.RoomOut)
def cleaning_done(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Цэвэрлэгээ дууслаа → өрөө сул боллоо."""
    session = _transition(room_id, "cleaning", "Цэвэрлэгээ эхлээгүй байна", db)
    session.status = "completed"
    session.cleaned_at = _now_local()
    if not session.cleaned_by_id:
        session.cleaned_by_id = current_user.id
        session.cleaned_by = current_user.full_name
    db.commit()
    return _room_out(db.query(models.Room).get(room_id), db)


# ═══════════════════════════════════════════════════════════
#  Дараалал (Room sessions)
# ═══════════════════════════════════════════════════════════
@sessions_router.get("/waiting", response_model=List[schemas.RoomSessionOut])
def list_waiting(db: Session = Depends(get_db)):
    """Төлбөрөө төлж, өрөө хүлээж буй тасалбарууд — төлсөн дарааллаар (FIFO)."""
    return (
        db.query(models.RoomSession)
        .filter(models.RoomSession.status == "waiting")
        .order_by(models.RoomSession.created_at, models.RoomSession.id)
        .all()
    )


@sessions_router.post("/{session_id}/assign", response_model=schemas.RoomSessionOut)
def assign_session(
    session_id: int,
    data: schemas.RoomAssignRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Хүлээж буй тасалбарт сул өрөө оноох."""
    _deny_cleaner(current_user)
    session = db.query(models.RoomSession).get(session_id)
    if not session:
        raise HTTPException(404, "Дараалал олдсонгүй")
    if session.status != "waiting":
        raise HTTPException(400, "Энэ тасалбар аль хэдийн оруулсан эсвэл цуцлагдсан байна")

    room = db.query(models.Room).get(data.room_id)
    if not room or not room.is_active:
        raise HTTPException(404, "Өрөө олдсонгүй")
    if _active_session(room.id, db):
        raise HTTPException(400, "Өрөө сул биш байна")

    session.room_id = room.id
    session.room_number = room.number
    session.status = "reserved"
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Өрөө сул биш байна (зэрэг үйлдэл). Дахин оролдоно уу.")
    db.refresh(session)
    return session


@sessions_router.post("/{session_id}/cancel", response_model=schemas.RoomSessionOut)
def cancel_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Хүлээж буй тасалбарыг цуцлах (төлбөр буцаахгүй — буцаалт бол захиалгыг устгана)."""
    _deny_cleaner(current_user)
    session = db.query(models.RoomSession).get(session_id)
    if not session:
        raise HTTPException(404, "Дараалал олдсонгүй")
    if session.status != "waiting":
        raise HTTPException(400, "Зөвхөн хүлээж буй тасалбарыг цуцална")
    session.status = "cancelled"
    session.ended_at = _now_local()
    db.commit()
    db.refresh(session)
    return session


# ═══════════════════════════════════════════════════════════
#  Хүлээлгийн танхимын дэлгэц (нэвтрэлтгүй)
#  ⚠ Хувийн мэдээлэл (нэр, утас, дүн) ХЭЗЭЭ Ч оруулахгүй
# ═══════════════════════════════════════════════════════════
@public_router.get("/queue-board")
def queue_board(db: Session = Depends(get_db)):
    day_start = _today_start()

    waiting = (
        db.query(models.RoomSession)
        .filter(
            models.RoomSession.status == "waiting",
            models.RoomSession.created_at >= day_start,
        )
        .order_by(models.RoomSession.created_at, models.RoomSession.id)
        .all()
    )

    now_serving = (
        db.query(models.RoomSession)
        .filter(
            models.RoomSession.status.in_(("reserved", "in_use")),
            models.RoomSession.room_id.isnot(None),
            models.RoomSession.created_at >= day_start,
        )
        .order_by(models.RoomSession.id.desc())
        .limit(8)
        .all()
    )

    # Дараалал төрөл бүрээр тусдаа тул төрлүүдийг эрэмбэтэйгээр нь өгнө
    types = (
        db.query(models.RoomType)
        .filter(models.RoomType.is_active == True)
        .order_by(models.RoomType.sort_order, models.RoomType.id)
        .all()
    )

    # Өрөөний төлөвийн самбар — зөвхөн нийтэд зориулсан мэдээлэл
    # (өрөөний дугаар, төрөл, төлөв, үлдсэн минут — нэр/утас/дүн ОГТ байхгүй)
    now_naive = _now_local().replace(tzinfo=None)
    rooms_out = []
    for room in (
        db.query(models.Room)
        .filter(models.Room.is_active == True)
        .order_by(models.Room.id)
        .all()
    ):
        s = _active_session(room.id, db)
        remaining_min = None
        if s and s.status == "in_use" and s.started_at:
            started = s.started_at.replace(tzinfo=None) if s.started_at.tzinfo else s.started_at
            end = started + timedelta(minutes=s.duration_min or 0)
            remaining_min = max(0, int((end - now_naive).total_seconds() // 60))
        rooms_out.append({
            "number": room.number,
            "type_name": room.room_type.name if room.room_type else None,
            "color": room.room_type.color if room.room_type else None,
            "status": s.status if s else "free",
            "remaining_min": remaining_min,
        })

    return {
        "types": [{"id": t.id, "name": t.name, "color": t.color} for t in types],
        "rooms": rooms_out,
        "waiting": [
            {"queue_no": s.queue_no, "type_name": s.type_name, "room_type_id": s.room_type_id}
            for s in waiting
        ],
        "now_serving": [
            {
                "queue_no": s.queue_no,
                "type_name": s.type_name,
                "room_type_id": s.room_type_id,
                "room_number": s.room_number,
                "status": s.status,
            }
            for s in now_serving
        ],
    }
