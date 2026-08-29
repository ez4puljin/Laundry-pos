"""Салбарын төвлөрсөн бүртгэл (multi-branch).

Салбар БҮР өөрийн SQLite файлтай — өгөгдөл огт холилдохгүй, салбар тус
бүрийг тусад нь backup хийж болно. Энэ модуль нь:

  · central.db      — салбаруудын жагсаалт + глобал хэрэглэгч (админ/нягтлан)
  · branches/*.db   — салбар тус бүрийн бүрэн өгөгдөл
  · engine кэш      — салбарын DB-г нээж, дахин ашиглана

Глобал хэрэглэгч (админ, нягтлан) нь central.db-д хадгалагдаж, салбар бүрийн
`users` хүснэгт рүү ХУУЛБАРЛАГДАНА (is_global=1). Ингэснээр нэвтрэлт,
захиалгын cashier_id зэрэг бүх FK салбар дотроо хэвийн ажиллана.
"""
import os
import re
import threading
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Integer, String, create_engine, event, func, text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ── Байршил ────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
CENTRAL_DB  = os.path.join(BASE_DIR, "central.db")
BRANCH_DIR  = os.path.join(BASE_DIR, "branches")
# Олон салбар болохоос ӨМНӨХ файл — 1-р салбар үүнийг хэвээр ашиглана
LEGACY_DB   = os.path.join(BASE_DIR, "laundry_pos.db")

CentralBase = declarative_base()


# ── SQLite тохиргоо ────────────────────────────────────
def _tune(engine):
    """Олон дэлгэц зэрэг ажиллахад тохирсон горим.

    · WAL   — уншигч бичигчийг блоклохгүй. Анхны `delete` горимд ТВ дэлгэц,
              POS, оочир зэрэг байнга уншиж байхад захиалга бичих түр саатдаг.
    · NORMAL — WAL-тай хослуулахад аюулгүй бөгөөд диск рүү тулгах тоо цөөрнө.
    · busy_timeout — түгжээ тохиолдвол шууд алдаа өгөхгүй, 5 сек хүлээнэ.
    """
    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA cache_size=-16000")     # ~16 MB
        cur.close()
    return engine


central_engine = _tune(create_engine(
    f"sqlite:///{CENTRAL_DB}",
    connect_args={"check_same_thread": False},
))
CentralSession = sessionmaker(autocommit=False, autoflush=False, bind=central_engine)


# ── Загварууд ──────────────────────────────────────────
class Branch(CentralBase):
    __tablename__ = "branches"

    id         = Column(Integer, primary_key=True, index=True)
    code       = Column(String(30), unique=True, nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    db_file    = Column(String(255), nullable=False)   # үнэмлэхүй зам
    address    = Column(String(255), nullable=True)
    phone      = Column(String(30),  nullable=True)
    is_active  = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class GlobalUser(CentralBase):
    """Бүх салбарт хүчинтэй хэрэглэгч — зөвхөн админ ба нягтлан."""
    __tablename__ = "global_users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False, index=True)
    full_name     = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), default="admin", nullable=False)  # admin | accountant
    is_active     = Column(Boolean, default=True, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


GLOBAL_ROLES = ("admin", "accountant")


# ── Туслах ─────────────────────────────────────────────
def slugify(name: str) -> str:
    """Салбарын нэрээс файлын нэрэнд тохирох код гаргана.

    Кирилл нэрийг латинаар хөрвүүлнэ («Баянзүрх» → «bayanzurh»), эс бөгөөс
    зөвхөн тоо/тэмдэгт үлдэж утгагүй код гарна.
    """
    from licensing.translit import latin
    s = re.sub(r"[^0-9A-Za-z]+", "-", latin(name or "").strip()).strip("-").lower()
    # Зөвхөн тоо (эсвэл хоосон) бол ялгах боломжгүй — угтвар нэмнэ
    if not s or s.isdigit():
        s = f"salbar-{s}" if s else "salbar"
    return s


def central_db():
    """FastAPI dependency — төвийн бүртгэлийн сесс."""
    db = CentralSession()
    try:
        yield db
    finally:
        db.close()


# ── Engine кэш ─────────────────────────────────────────
_engines: dict[str, tuple] = {}      # code -> (engine, SessionLocal)
_lock = threading.Lock()
# Салбарын DB бэлэн болсон эсэх (create_all + migrate + seed нэг л удаа)
_ready: set[str] = set()

# main.py-аас суулгах дэгээнүүд (дугуй импортоос зайлсхийнэ)
_migrate_hook = None      # fn(engine)
_seed_hook    = None      # fn(SessionLocal)


def set_hooks(migrate_fn, seed_fn) -> None:
    """main.py нь _migrate/_seed-ээ энд бүртгүүлнэ."""
    global _migrate_hook, _seed_hook
    _migrate_hook, _seed_hook = migrate_fn, seed_fn


def engine_for(branch: Branch):
    """Салбарын engine + SessionLocal (кэштэй)."""
    with _lock:
        hit = _engines.get(branch.code)
        if hit:
            return hit
        os.makedirs(os.path.dirname(branch.db_file) or BASE_DIR, exist_ok=True)
        eng = _tune(create_engine(
            f"sqlite:///{branch.db_file}",
            connect_args={"check_same_thread": False},
        ))
        SL = sessionmaker(autocommit=False, autoflush=False, bind=eng)
        _engines[branch.code] = (eng, SL)
        return eng, SL


def ensure_ready(branch: Branch) -> None:
    """Салбарын DB-г үүсгэж, migration + seed + глобал хэрэглэгч тааруулна."""
    if branch.code in _ready:
        return
    with _lock:
        if branch.code in _ready:
            return
        eng, SL = _engines.get(branch.code) or (None, None)
    if eng is None:
        eng, SL = engine_for(branch)

    import models                                   # дугуй импортоос сэргийлнэ
    # Дараалал ЧУХАЛ:
    #   create_all → migrate (хуучин DB-д is_global багана нэмнэ)
    #   → глобал хэрэглэгч тааруулах → seed
    # Ингэснээр ШИНЭ салбарт seed нь давхар «admin» үүсгэхгүй (глобал админ
    # аль хэдийн орсон байх тул users хоосон биш).
    models.Base.metadata.create_all(bind=eng)
    if _migrate_hook:
        _migrate_hook(eng)
    sync_global_users(branch, SL)
    if _seed_hook:
        _seed_hook(SL)
    _ready.add(branch.code)


def unload(code: str) -> None:
    """Салбарын engine-ийг хааж, DB файлыг чөлөөлнө."""
    with _lock:
        pair = _engines.pop(code, None)
        _ready.discard(code)
    if pair:
        pair[0].dispose()


def shutdown_all() -> None:
    """Бүх салбарын болон төвийн холболтыг хаана.

    Нөөцөөс сэргээхэд файлуудыг солих шаардлагатай — Windows дээр нээлттэй
    файлыг солих боломжгүй тул эхлээд бүгдийг чөлөөлнө.
    """
    with _lock:
        pairs = list(_engines.values())
        _engines.clear()
        _ready.clear()
    for eng, _ in pairs:
        eng.dispose()
    central_engine.dispose()


def session_for(branch: Branch):
    """Салбарын шинэ сесс. Эхний хандалтад DB-г бэлтгэнэ."""
    _, SL = engine_for(branch)
    ensure_ready(branch)
    return SL()


# ── Салбар унших ───────────────────────────────────────
def list_branches(active_only: bool = True) -> list[Branch]:
    db = CentralSession()
    try:
        q = db.query(Branch)
        if active_only:
            q = q.filter(Branch.is_active == True)
        return q.order_by(Branch.sort_order, Branch.id).all()
    finally:
        db.close()


def get_branch(code: str):
    if not code:
        return None
    db = CentralSession()
    try:
        return db.query(Branch).filter(Branch.code == code).first()
    finally:
        db.close()


def default_branch():
    """Эхний идэвхтэй салбар — салбар заагаагүй хандалтад ашиглана."""
    branches = list_branches(active_only=True)
    return branches[0] if branches else None


# ── Глобал хэрэглэгчийг салбар руу тааруулах ───────────
def sync_global_users(branch: Branch, SL=None) -> None:
    """central.db-ийн глобал хэрэглэгчдийг салбарын users хүснэгтэд тааруулна.

    · Байхгүйг нэмнэ, өөрчлөгдсөнийг шинэчилнэ (нэр, нууц үг, эрх, идэвх)
    · Төвөөс УСТСАН глобал хэрэглэгчийг салбараас ч хасна
    · Салбарын дотоод хэрэглэгчид (is_global=0) огт хөндөгдөхгүй
    """
    import models
    if SL is None:
        _, SL = engine_for(branch)

    cdb = CentralSession()
    try:
        globals_ = cdb.query(GlobalUser).all()
        wanted = {g.username: g for g in globals_}
    finally:
        cdb.close()

    db = SL()
    try:
        existing = {u.username: u for u in
                    db.query(models.User).filter(models.User.is_global == True).all()}

        for username, g in wanted.items():
            u = existing.get(username)
            if u is None:
                # Салбарт ижил нэртэй ДОТООД хэрэглэгч байвал давхардуулахгүй
                clash = db.query(models.User).filter(
                    models.User.username == username).first()
                if clash is not None:
                    continue
                u = models.User(username=username, is_global=True)
                db.add(u)
            u.full_name     = g.full_name
            u.password_hash = g.password_hash
            u.role          = g.role
            u.is_active     = g.is_active
            u.is_global     = True
            u.cashier_scope = "master"

        for username, u in existing.items():
            if username not in wanted:
                db.delete(u)

        db.commit()
    finally:
        db.close()


def sync_all_branches() -> None:
    """Глобал хэрэглэгч өөрчлөгдөхөд БҮХ салбарт тархаана."""
    for b in list_branches(active_only=False):
        if b.code in _ready:
            _, SL = engine_for(b)
            sync_global_users(b, SL)
        # Бэлтгэгдээгүй салбар эхний хандалтдаа өөрөө тааруулна


# ── Анхны тохируулга ───────────────────────────────────
def bootstrap() -> None:
    """central.db үүсгэж, эхний салбарыг бүртгэнэ.

    Олон салбар руу шилжихэд ХУУЧИН laundry_pos.db хөдлөхгүй — 1-р салбар
    яг тэр файлыг үргэлжлүүлэн ашиглана.
    """
    CentralBase.metadata.create_all(bind=central_engine)
    os.makedirs(BRANCH_DIR, exist_ok=True)

    db = CentralSession()
    try:
        if db.query(Branch).count() == 0:
            db.add(Branch(code="main", name="Төв салбар",
                          db_file=LEGACY_DB, sort_order=0))
            db.commit()
    finally:
        db.close()


def adopt_admins(branch: Branch) -> None:
    """Глобал хэрэглэгч огт байхгүй бол салбарын админуудыг глобал болгоно.

    · Одоо ажиллаж буй суулгацад — байгаа админ бүх салбарт хүчинтэй болно
    · Шинэ суулгацад — seed-ийн admin/admin123 глобал болно
    Аль тохиолдолд ч нэвтрэх эрхгүй үлдэхээс сэргийлнэ.
    """
    import models
    cdb = CentralSession()
    try:
        if cdb.query(GlobalUser).count() > 0:
            return
        _, SL = engine_for(branch)
        db = SL()
        try:
            admins = db.query(models.User).filter(
                models.User.role == "admin").all()
            if not admins:
                return
            for a in admins:
                cdb.add(GlobalUser(
                    username=a.username, full_name=a.full_name,
                    password_hash=a.password_hash, role="admin",
                    is_active=a.is_active,
                ))
                a.is_global = True
            cdb.commit()
            db.commit()
        finally:
            db.close()
    finally:
        cdb.close()
