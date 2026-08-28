import sys
import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import engine, SessionLocal
import models
import licensing
from routers import services, customers, orders, inventory, reports, categories, machines, settings, shifts, rooms, finance
from routers import license_api
from routers import users as users_router
from auth import get_current_user, require_admin, hash_password

# Windows UTF-8 encoding засах.
# Аль хэдийн UTF-8 болсон урсгалыг дахин боохгүй — давхар боовол эхний
# боолт цуглуулагдахдаа доод буферийг хааж "I/O operation on closed file"
# алдаа өгдөг (жишээ нь main-г өөр скриптээс import хийхэд).
def _force_utf8(stream_name: str):
    stream = getattr(sys, stream_name)
    if (getattr(stream, "encoding", "") or "").lower().replace("-", "") == "utf8":
        return
    buffer = getattr(stream, "buffer", None)
    if buffer is not None:
        setattr(sys, stream_name,
                io.TextIOWrapper(buffer, encoding="utf-8", errors="replace"))


if sys.platform == "win32":
    _force_utf8("stdout")
    _force_utf8("stderr")

# ── DB үүсгэх ───────────────────────────────────────────
models.Base.metadata.create_all(bind=engine)


def _migrate():
    """SQLite column migration - шинэ баганууд нэмэх"""
    from sqlalchemy import text, inspect
    inspector = inspect(engine)

    # inventory хүснэгтэд sale_price, is_for_sale нэмэх
    inv_cols = [c["name"] for c in inspector.get_columns("inventory")]
    with engine.connect() as conn:
        if "sale_price" not in inv_cols:
            conn.execute(text("ALTER TABLE inventory ADD COLUMN sale_price REAL DEFAULT 0.0"))
            conn.commit()
        if "is_for_sale" not in inv_cols:
            conn.execute(text("ALTER TABLE inventory ADD COLUMN is_for_sale INTEGER DEFAULT 0"))
            conn.commit()

    # order_items хүснэгтийг product_id дэмжихээр дахин үүсгэх
    oi_cols = [c["name"] for c in inspector.get_columns("order_items")]
    if "product_id" not in oi_cols:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE order_items_new (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id    INTEGER NOT NULL,
                    service_id  INTEGER,
                    product_id  INTEGER,
                    item_type   VARCHAR(20) DEFAULT 'service',
                    item_name   VARCHAR(100),
                    quantity    INTEGER DEFAULT 1,
                    unit_price  REAL NOT NULL,
                    total_price REAL NOT NULL,
                    notes       VARCHAR(255),
                    FOREIGN KEY (order_id)   REFERENCES orders(id),
                    FOREIGN KEY (service_id) REFERENCES services(id),
                    FOREIGN KEY (product_id) REFERENCES inventory(id)
                )
            """))
            conn.execute(text("""
                INSERT INTO order_items_new
                    (id, order_id, service_id, item_type, quantity, unit_price, total_price, notes)
                SELECT id, order_id, service_id, 'service', quantity, unit_price, total_price, notes
                FROM order_items
            """))
            conn.execute(text("DROP TABLE order_items"))
            conn.execute(text("ALTER TABLE order_items_new RENAME TO order_items"))
            conn.commit()
    # orders хүснэгтэд payment_details нэмэх
    ord_cols = [c["name"] for c in inspector.get_columns("orders")]
    with engine.connect() as conn:
        if "payment_details" not in ord_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN payment_details TEXT"))
            conn.commit()

    # orders хүснэгтэд phone нэмэх (SMS мэдэгдэлд ашиглах)
    with engine.connect() as conn:
        if "phone" not in ord_cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN phone VARCHAR(20)"))
            conn.commit()

    # categories хүснэгт үүсгэх (хуучин DB-д байхгүй байж болно)
    existing_tables = inspector.get_table_names()
    if "categories" not in existing_tables:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS categories (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    value       VARCHAR(50) UNIQUE NOT NULL,
                    label       VARCHAR(100) NOT NULL,
                    color       VARCHAR(100) DEFAULT 'from-gray-400 to-gray-600',
                    badge_color VARCHAR(100) DEFAULT 'bg-gray-100 text-gray-600',
                    sort_order  INTEGER DEFAULT 0
                )
            """))
            conn.commit()
    # categories хүснэгтэд machine_type нэмэх
    if "categories" in existing_tables:
        cat_cols = [c["name"] for c in inspector.get_columns("categories")]
        if "machine_type" not in cat_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE categories ADD COLUMN machine_type VARCHAR(20)"))
                conn.execute(text("UPDATE categories SET machine_type='washer' WHERE value='wash'"))
                conn.execute(text("UPDATE categories SET machine_type='dryer' WHERE value IN ('dry','iron')"))
                conn.commit()

    # machines, machine_usages хүснэгтүүд
    if "machines" not in existing_tables:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS machines (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    name         VARCHAR(100) NOT NULL,
                    machine_type VARCHAR(20) NOT NULL,
                    is_active    INTEGER DEFAULT 1
                )
            """))
            conn.commit()

    if "machine_usages" not in existing_tables:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS machine_usages (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    machine_id    INTEGER NOT NULL,
                    order_id      INTEGER NOT NULL,
                    order_item_id INTEGER,
                    customer_name VARCHAR(100),
                    service_name  VARCHAR(100),
                    duration_min  INTEGER NOT NULL,
                    started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at      DATETIME,
                    status        VARCHAR(20) DEFAULT 'running',
                    FOREIGN KEY (machine_id)    REFERENCES machines(id),
                    FOREIGN KEY (order_id)      REFERENCES orders(id),
                    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
                )
            """))
            conn.commit()

    # service_machines хүснэгт (many-to-many)
    if "service_machines" not in existing_tables:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS service_machines (
                    service_id INTEGER NOT NULL,
                    machine_id INTEGER NOT NULL,
                    PRIMARY KEY (service_id, machine_id),
                    FOREIGN KEY (service_id) REFERENCES services(id),
                    FOREIGN KEY (machine_id) REFERENCES machines(id)
                )
            """))
            conn.commit()

    # customers хүснэгтэд points_expire_at нэмэх
    cust_cols = [c["name"] for c in inspector.get_columns("customers")]
    if "points_expire_at" not in cust_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE customers ADD COLUMN points_expire_at DATETIME"))
            conn.commit()

    # machine_usages.sub_index
    mu_cols = [r["name"] for r in inspect(engine).get_columns("machine_usages")]
    if "sub_index" not in mu_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE machine_usages ADD COLUMN sub_index INTEGER DEFAULT 0"))
            conn.commit()

    # orders.is_paid (төлбөр төлөгдсөн эсэх)
    ord_cols2 = [c["name"] for c in inspect(engine).get_columns("orders")]
    if "is_paid" not in ord_cols2:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE orders ADD COLUMN is_paid INTEGER DEFAULT 1"))
            conn.commit()

    # orders.deleted_at (soft delete)
    if "deleted_at" not in ord_cols2:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE orders ADD COLUMN deleted_at DATETIME"))
            conn.commit()

    # orders анхааруулгын баганууд (төлбөр төлөлгүй явсан захиалга)
    ord_cols_flag = [c["name"] for c in inspect(engine).get_columns("orders")]
    flag_cols = {
        "is_flagged":     "INTEGER DEFAULT 0",
        "flagged_at":     "DATETIME",
        "flagged_reason": "TEXT",
        "flagged_by":     "VARCHAR(100)",
    }
    for col, ddl in flag_cols.items():
        if col not in ord_cols_flag:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col} {ddl}"))
                conn.commit()

    # orders — төлбөр хэзээ / хэн авсан (нөхөж авсан төлбөрийг ялгахад хэрэгтэй)
    ord_cols_paid = [c["name"] for c in inspect(engine).get_columns("orders")]
    paid_cols = {
        "paid_at":    "DATETIME",
        "paid_by_id": "INTEGER",
        "paid_by":    "VARCHAR(100)",
    }
    added_paid_at = False
    for col, ddl in paid_cols.items():
        if col not in ord_cols_paid:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col} {ddl}"))
                conn.commit()
            if col == "paid_at":
                added_paid_at = True
    if added_paid_at:
        # Хуучин төлөгдсөн захиалгуудыг үүссэн хугацаанд нь төлөгдсөн гэж үзнэ —
        # ингэснээр «нөхөж авсан төлбөр» (paid_at ≠ created_at өдөр) зөв ялгагдана.
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE orders SET paid_at = created_at WHERE is_paid = 1 AND paid_at IS NULL"
            ))
            conn.commit()

    # cashier_shifts хүснэгт
    if "cashier_shifts" not in existing_tables:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS cashier_shifts (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id    INTEGER NOT NULL,
                    started_at DATETIME,
                    ended_at   DATETIME,
                    status     VARCHAR(20) DEFAULT 'active',
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """))
            conn.commit()

    # cashier_shifts.scope — кассын төрөл (laundry | shower | master)
    sh_cols = [c["name"] for c in inspect(engine).get_columns("cashier_shifts")]
    if "scope" not in sh_cols:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE cashier_shifts ADD COLUMN scope VARCHAR(20) "
                "NOT NULL DEFAULT 'master'"
            ))
            # Хуучин ээлжүүдэд эзний одоогийн ажлын хүрээг оноож өгнө
            conn.execute(text(
                "UPDATE cashier_shifts SET scope = COALESCE("
                "  (SELECT u.cashier_scope FROM users u WHERE u.id = cashier_shifts.user_id),"
                "  'master')"
            ))
            conn.commit()

    # orders.cashier_id
    ord_cols3 = [c["name"] for c in inspect(engine).get_columns("orders")]
    if "cashier_id" not in ord_cols3:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE orders ADD COLUMN cashier_id INTEGER"))
            conn.commit()

    # order_items.room_id (Шүршүүрийн өрөө)
    oi_cols_room = [c["name"] for c in inspect(engine).get_columns("order_items")]
    if "room_id" not in oi_cols_room:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN room_id INTEGER REFERENCES rooms(id)"))
            conn.commit()

    # users.cashier_scope (кассын ажлын хүрээ: laundry | shower | master)
    usr_cols = [c["name"] for c in inspect(engine).get_columns("users")]
    if "cashier_scope" not in usr_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN cashier_scope VARCHAR(20) DEFAULT 'master'"))
            conn.commit()

    # room_sessions.no_show (дуудахад ирээгүй — оочир хадгалагдана)
    rs_cols = [c["name"] for c in inspect(engine).get_columns("room_sessions")]
    if "no_show" not in rs_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE room_sessions ADD COLUMN no_show INTEGER DEFAULT 0"))
            conn.commit()
        rs_cols.append("no_show")

    # inventory — барааны ангилал (product_categories-ийг create_all үүсгэнэ)
    inv_cols2 = [c["name"] for c in inspect(engine).get_columns("inventory")]
    if "category_id" not in inv_cols2:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE inventory ADD COLUMN category_id INTEGER "
                "REFERENCES product_categories(id)"))
            conn.commit()

    # orders — НӨАТ талбарууд
    ord_cols2 = [c["name"] for c in inspect(engine).get_columns("orders")]
    with engine.connect() as conn:
        if "vat_amount" not in ord_cols2:
            conn.execute(text("ALTER TABLE orders ADD COLUMN vat_amount REAL DEFAULT 0.0"))
            conn.commit()
        if "product_vat" not in ord_cols2:
            conn.execute(text("ALTER TABLE orders ADD COLUMN product_vat INTEGER DEFAULT 0"))
            conn.commit()

    # ── room_sessions-ийг дахин үүсгэх ────────────────────────────
    #  Шалтгаан: (1) tariff_id багана нэмэх, (2) room_type_id-г NULL
    #  зөвшөөрөх (өрөө оноогдох үед л тодорно), (3) ux_room_sessions_active_room
    #  unique index-ийг УСТГАХ — нэг өрөөнд олон хүн зэрэг орж болох болсон.
    #  SQLite багана өөрчилж/индекс буулгаж чаддаггүй тул хүснэгтийг сэлгэнэ.
    if "tariff_id" not in rs_cols:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE room_sessions_new (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id             INTEGER REFERENCES rooms(id),
                    room_type_id        INTEGER REFERENCES room_types(id),
                    tariff_id           INTEGER REFERENCES shower_tariffs(id),
                    order_id            INTEGER NOT NULL REFERENCES orders(id),
                    order_item_id       INTEGER REFERENCES order_items(id),
                    queue_no            INTEGER NOT NULL DEFAULT 0,
                    room_number         VARCHAR(20),
                    type_name           VARCHAR(100),
                    customer_name       VARCHAR(100),
                    price               FLOAT NOT NULL,
                    duration_min        INTEGER NOT NULL,
                    status              VARCHAR(20),
                    no_show             INTEGER DEFAULT 0,
                    created_at          DATETIME,
                    started_at          DATETIME,
                    ended_at            DATETIME,
                    cleaning_started_at DATETIME,
                    cleaned_at          DATETIME,
                    cleaned_by_id       INTEGER REFERENCES users(id),
                    cleaned_by          VARCHAR(100)
                )
            """))
            conn.execute(text("""
                INSERT INTO room_sessions_new
                    (id, room_id, room_type_id, order_id, order_item_id, queue_no,
                     room_number, type_name, customer_name, price, duration_min,
                     status, no_show, created_at, started_at, ended_at,
                     cleaning_started_at, cleaned_at, cleaned_by_id, cleaned_by)
                SELECT
                     id, room_id, room_type_id, order_id, order_item_id, queue_no,
                     room_number, type_name, customer_name, price, duration_min,
                     status, no_show, created_at, started_at, ended_at,
                     cleaning_started_at, cleaned_at, cleaned_by_id, cleaned_by
                FROM room_sessions
            """))
            conn.execute(text("DROP TABLE room_sessions"))
            conn.execute(text("ALTER TABLE room_sessions_new RENAME TO room_sessions"))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_room_sessions_status "
                "ON room_sessions (status)"))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_room_sessions_id "
                "ON room_sessions (id)"))
            conn.commit()
        print("room_sessions rebuilt (tariff_id, nullable room_type_id, no unique index)")

    # Зөвхөн шүршүүрээс бүрдсэн хуучин захиалгуудыг «олгосон» болгоно.
    # Эдгээрт угаалгын ажил байхгүй тул дараалалд хүлээх шаардлагагүй бөгөөд
    # pending хэвээр үлдвэл Түүх, Тайланд харагдахгүй байсан.
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE orders SET status = 'delivered',
                              delivered_at = COALESCE(delivered_at, created_at)
            WHERE status = 'pending'
              AND id IN (SELECT order_id FROM order_items
                         GROUP BY order_id
                         HAVING SUM(CASE WHEN item_type != 'room' THEN 1 ELSE 0 END) = 0)
        """))
        conn.commit()

    print("Migration done.")


def _seed():
    db = SessionLocal()
    try:
        # Services, inventory-г автомат seed хийхгүй — Удирдлага цэснээс гараар оруулна
        if db.query(models.Category).count() == 0:
            cats_data = [
                dict(value="wash",    label="🧼 Угаалга",           color="from-blue-400 to-blue-600",    badge_color="bg-blue-100 text-blue-700",    sort_order=0, machine_type="washer"),
                dict(value="dry",     label="🧺 Хуурай цэвэрлэгээ", color="from-purple-400 to-purple-600", badge_color="bg-purple-100 text-purple-700", sort_order=1, machine_type="dryer"),
                dict(value="iron",    label="🔆 Хатаалга",           color="from-orange-400 to-orange-600", badge_color="bg-orange-100 text-orange-700", sort_order=2, machine_type="dryer"),
                dict(value="general", label="📦 Бусад",              color="from-gray-400 to-gray-600",    badge_color="bg-gray-100 text-gray-600",    sort_order=3),
            ]
            for c in cats_data:
                db.add(models.Category(**c))

        db.commit()
        print("Seed check done.")

        # ── Default admin user ──────────────────────────────
        if db.query(models.User).count() == 0:
            admin = models.User(
                username      = "admin",
                full_name     = "Админ",
                password_hash = hash_password("admin123"),
                role          = "admin",
                is_active     = True,
            )
            db.add(admin)
            db.commit()
            print("Default admin created  →  admin / admin123")

        # ── Default machines ──────────────────────────────
        if db.query(models.Machine).count() == 0:
            machines_data = [
                dict(name="Угаалга #1",      machine_type="washer"),
                dict(name="Угаалга #2",      machine_type="washer"),
                dict(name="Хатаалга #1",     machine_type="dryer"),
                dict(name="Хатаалга #2",     machine_type="dryer"),
                dict(name="Пүүз угаалга #1", machine_type="shoe_washer"),
            ]
            for m in machines_data:
                db.add(models.Machine(**m))
            db.commit()
            print("Default machines created (5)")

        # ── Мөнгөн данс (санхүү) ──────────────────────────
        if db.query(models.FinAccount).count() == 0:
            db.add(models.FinAccount(name="Касс", sort_order=0, pos_cash=True))
            db.add(models.FinAccount(name="Банк", sort_order=1, pos_transfer=True, pos_card=True))
            db.commit()
            print("Default fin accounts created (Касс, Банк)")

        # ── Шүршүүрийн өрөөний төрөл (тарифгүй — зөвхөн багтаамж) ──
        # Өрөөнүүдийг seed хийхгүй — Удирдлага цэснээс зурж үүсгэнэ
        if db.query(models.RoomType).count() == 0:
            room_types_data = [
                dict(name="1 хүний", price=0, duration_min=60, color="#38bdf8", sort_order=0),
                dict(name="2 хүний", price=0, duration_min=60, color="#a78bfa", sort_order=1),
            ]
            for rt in room_types_data:
                db.add(models.RoomType(**rt))
            db.commit()
            print("Default room types created (2)")

        # ── Шүршүүрийн тариф (хүний төрөл) ────────────────
        # Үнийг Удирдлага → Шүршүүрийн тариф цэснээс засна
        if db.query(models.ShowerTariff).count() == 0:
            # Үнэ нь НӨАТ БАГТСАН дүн. Хугацаа энд байхгүй — өрөөний төрөл дээр.
            tariffs_data = [
                dict(name="Том хүн",              price=5000, color="#38bdf8", sort_order=0),
                dict(name="Сургуулийн хүүхэд",    price=3000, color="#a78bfa", sort_order=1),
                dict(name="Цэцэрлэгийн хүүхэд",   price=2000, color="#34d399", sort_order=2),
            ]
            for t in tariffs_data:
                db.add(models.ShowerTariff(**t))
            db.commit()
            print("Default shower tariffs created (3)")
    except Exception as e:
        print(f"Seed error: {e}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate()
    _seed()
    yield


app = FastAPI(
    title="Laundry POS API",
    description="Laundry POS System",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


# ── Лицензийн хамгаалалт ───────────────────────────────
# Эрх дууссан/түгжигдсэн үед бүх ажлын API хаагдана. Зөвхөн лицензийн
# цэгүүд болон нэвтрэх хуудасны нэр авах цэг нээлттэй үлдэнэ — ингэснээр
# frontend-ийг өөрчилсөн ч өгөгдөлд хүрэх боломжгүй.
LICENSE_FREE_PREFIXES = (
    "/license/",
    "/public/brand",
    "/docs",
    "/redoc",
    "/openapi.json",
)


@app.middleware("http")
async def license_guard(request, call_next):
    path = request.url.path
    if (
        request.method == "OPTIONS"
        or path == "/"
        or path.startswith(LICENSE_FREE_PREFIXES)
    ):
        return await call_next(request)

    state = licensing.status()
    if not state["ok"]:
        return JSONResponse(
            status_code=402,
            content={"detail": state["message"], "license": state},
        )
    return await call_next(request)


# CORS-ыг ХАМГИЙН СҮҮЛД нэмнэ — ингэснээр гадна талд байрлаж, 402
# хариунд ч CORS толгойнууд зөв тавигдана (гар утасны апп-д чухал).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────
# Лиценз: нэвтрэлтгүй (түгжигдсэн үед эрх нээх шаардлагатай)
app.include_router(license_api.router)

# Public: /auth/login, /auth/me  |  Admin: /users/*
app.include_router(users_router.router)

# Any authenticated user
app.include_router(services.router,   dependencies=[Depends(get_current_user)])
app.include_router(customers.router,  dependencies=[Depends(get_current_user)])
app.include_router(orders.router,     dependencies=[Depends(get_current_user)])

# Admin only (reports)
app.include_router(reports.router,    dependencies=[Depends(require_admin)])
# Categories: GET нь бүх user, POST/PUT/DELETE нь admin (router дотроо тодорхойлно)
app.include_router(categories.router)
# Inventory: GET нь бүх user, POST/PATCH/DELETE нь admin (router дотроо тодорхойлно)
app.include_router(inventory.router)
# Барааны ангилал (үйлчилгээнийхээс тусдаа)
app.include_router(inventory.categories_router)
# Machines: any authenticated user
app.include_router(machines.router, dependencies=[Depends(get_current_user)])
# Settings: GET нь бүх user, PUT нь admin (router дотроо тодорхойлно)
app.include_router(settings.router, dependencies=[Depends(get_current_user)])
# Системийн нэр — нэвтрэх хуудас, ТВ дэлгэц уншина (нэвтрэлтгүй)
app.include_router(settings.public_router)
# Shifts: authenticated users
app.include_router(shifts.router, dependencies=[Depends(get_current_user)])
# Шүршүүр: CRUD нь admin (router дотроо), унших/шилжилт нь нэвтэрсэн хэрэглэгч
app.include_router(rooms.tariffs_router,  dependencies=[Depends(get_current_user)])
app.include_router(rooms.types_router,    dependencies=[Depends(get_current_user)])
app.include_router(rooms.router,          dependencies=[Depends(get_current_user)])
app.include_router(rooms.sessions_router, dependencies=[Depends(get_current_user)])
# Хүлээлгийн танхимын дэлгэц — нэвтрэлтгүй
app.include_router(rooms.public_router)
# Санхүү: зөвхөн админ
app.include_router(finance.router, dependencies=[Depends(require_admin)])


@app.get("/")
def root():
    return {"message": "Laundry POS API is running"}


# ── Admin: Data cleanup ────────────────────────────────
@app.post("/admin/cleanup", dependencies=[Depends(require_admin)])
def cleanup_data():
    from sqlalchemy import text
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM machine_usages"))
        db.execute(text("DELETE FROM room_sessions"))
        db.execute(text("DELETE FROM fin_transactions"))
        db.execute(text("DELETE FROM debt_entries"))
        db.execute(text("DELETE FROM purchase_items"))
        db.execute(text("DELETE FROM purchases"))
        db.execute(text("DELETE FROM service_machines"))
        db.execute(text("DELETE FROM order_items"))
        db.execute(text("DELETE FROM orders"))
        db.execute(text("DELETE FROM customers"))
        db.execute(text("DELETE FROM services"))
        db.execute(text("DELETE FROM inventory"))
        db.commit()
        return {"ok": True, "message": "All data cleaned. Machines and categories preserved."}
    except Exception as e:
        db.rollback()
        return {"ok": False, "message": str(e)}
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
