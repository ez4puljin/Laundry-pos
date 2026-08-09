import sys
import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
import models
from routers import services, customers, orders, inventory, reports, categories, machines, settings, shifts
from routers import users as users_router
from auth import get_current_user, require_admin, hash_password

# Windows UTF-8 encoding засах
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

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

    # orders.cashier_id
    ord_cols3 = [c["name"] for c in inspect(engine).get_columns("orders")]
    if "cashier_id" not in ord_cols3:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE orders ADD COLUMN cashier_id INTEGER"))
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
# Machines: any authenticated user
app.include_router(machines.router, dependencies=[Depends(get_current_user)])
# Settings: GET нь бүх user, PUT нь admin (router дотроо тодорхойлно)
app.include_router(settings.router, dependencies=[Depends(get_current_user)])
# Shifts: authenticated users
app.include_router(shifts.router, dependencies=[Depends(get_current_user)])


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
