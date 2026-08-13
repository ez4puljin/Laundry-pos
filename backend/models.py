from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text, Enum, Table, Index, text as sa_text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from datetime import datetime, timezone, timedelta

from database import Base

# Монгол цаг (UTC+8)
_LOCAL_TZ = timezone(timedelta(hours=8))
def _now_local():
    return datetime.now(_LOCAL_TZ)


# ── Association table: Service ↔ Machine (many-to-many) ──
service_machines = Table(
    "service_machines",
    Base.metadata,
    Column("service_id", Integer, ForeignKey("services.id"), primary_key=True),
    Column("machine_id", Integer, ForeignKey("machines.id"), primary_key=True),
)


# ── ServiceCategory (Үйлчилгээний ангилал) ─────────────
class Category(Base):
    __tablename__ = "categories"

    id          = Column(Integer, primary_key=True, index=True)
    value       = Column(String(50), unique=True, nullable=False)   # slug: "wash", "dry" …
    label       = Column(String(100), nullable=False)               # "🧼 Угаалга"
    color       = Column(String(100), default="from-gray-400 to-gray-600")   # gradient CSS
    badge_color = Column(String(100), default="bg-gray-100 text-gray-600")   # badge CSS
    sort_order  = Column(Integer, default=0)
    machine_type = Column(String(20), nullable=True)   # washer / dryer / shoe_washer — аль машинд хамаарах


# ── Enums ──────────────────────────────────────────────
class OrderStatus(str, enum.Enum):
    PENDING    = "pending"       # Хүлээгдэж байна
    PROCESSING = "processing"   # Үйлчилгээ хийгдэж байна
    WASHING    = "washing"       # (хуучин) Угааж байна → processing руу map
    IRONING    = "ironing"       # (хуучин) Индүүдэж байна → processing руу map
    READY      = "ready"         # Бэлэн болсон
    DELIVERED  = "delivered"     # Олгосон
    ARCHIVED   = "archived"     # Архивлагдсан


class PaymentMethod(str, enum.Enum):
    CASH       = "cash"
    CARD       = "card"
    TRANSFER   = "transfer"    # Шилжүүлэг
    POINTS     = "points"
    MIXED      = "mixed"


class DiscountType(str, enum.Enum):
    PERCENT    = "percent"
    AMOUNT     = "amount"


# ── Customer (Үйлчлүүлэгч) ─────────────────────────────
class Customer(Base):
    __tablename__ = "customers"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)
    phone        = Column(String(20), unique=True, index=True, nullable=False)
    email        = Column(String(100), nullable=True)
    points       = Column(Integer, default=0)         # Лояалти оноо
    total_spent  = Column(Float, default=0.0)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    orders       = relationship("Order", back_populates="customer")


# ── Service (Угаалгын үйлчилгээ) ──────────────────────
class Service(Base):
    __tablename__ = "services"

    id           = Column(Integer, primary_key=True, index=True)
    code         = Column(String(20), unique=True, index=True, nullable=False)
    name         = Column(String(100), nullable=False)
    name_en      = Column(String(100), nullable=True)
    price        = Column(Float, nullable=False)
    unit         = Column(String(20), default="ширхэг")   # ширхэг / кг / ширхэг
    category     = Column(String(50), default="general")
    duration_min = Column(Integer, default=60)            # Дуусах хугацаа (минут)
    points_earn  = Column(Integer, default=1)             # 1₮ = N оноо
    is_active    = Column(Boolean, default=True)
    image_url    = Column(String(255), nullable=True)

    order_items  = relationship("OrderItem", back_populates="service")
    machines     = relationship("Machine", secondary=service_machines, lazy="selectin")

    @property
    def machine_ids(self):
        return [m.id for m in self.machines]


# ── Order (Захиалга) ────────────────────────────────────
class Order(Base):
    __tablename__ = "orders"

    id              = Column(Integer, primary_key=True, index=True)
    order_number    = Column(String(20), unique=True, index=True)  # LAU-20240101-001
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    cashier_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    cashier_name    = Column(String(100), default="Кассчин")

    subtotal        = Column(Float, default=0.0)
    discount_type   = Column(String(20), nullable=True)
    discount_value  = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    total           = Column(Float, default=0.0)

    payment_method  = Column(String(20), default=PaymentMethod.CASH)
    payment_details = Column(Text, nullable=True)   # JSON: {"cash":10000,"transfer":20000}
    points_used     = Column(Integer, default=0)
    points_earned   = Column(Integer, default=0)

    is_paid         = Column(Boolean, default=False)
    paid_at         = Column(DateTime(timezone=True), nullable=True)  # төлбөр бодитоор орсон хугацаа
    paid_by_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_by         = Column(String(100), nullable=True)              # төлбөр авсан кассчны нэр
    phone           = Column(String(20), nullable=True)   # SMS явуулах утасны дугаар (харилцагчгүй захиалгад)
    status          = Column(String(20), default=OrderStatus.PENDING)
    notes           = Column(Text, nullable=True)

    # ── Анхааруулга (төлбөр төлөлгүй явсан) ──────────────
    is_flagged      = Column(Boolean, default=False)
    flagged_at      = Column(DateTime(timezone=True), nullable=True)
    flagged_reason  = Column(Text, nullable=True)
    flagged_by      = Column(String(100), nullable=True)   # тэмдэглэсэн кассчны нэр

    created_at      = Column(DateTime(timezone=True), default=_now_local)
    updated_at      = Column(DateTime(timezone=True), onupdate=_now_local)
    delivered_at    = Column(DateTime(timezone=True), nullable=True)
    deleted_at      = Column(DateTime(timezone=True), nullable=True)

    customer        = relationship("Customer", back_populates="orders")
    items           = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


# ── OrderItem (Захиалгын дэлгэрэнгүй) ─────────────────
class OrderItem(Base):
    __tablename__ = "order_items"

    id          = Column(Integer, primary_key=True, index=True)
    order_id    = Column(Integer, ForeignKey("orders.id"), nullable=False)
    service_id  = Column(Integer, ForeignKey("services.id"), nullable=True)   # nullable: product items won't have this
    product_id  = Column(Integer, ForeignKey("inventory.id"), nullable=True)  # for sold inventory items
    room_id     = Column(Integer, ForeignKey("rooms.id"), nullable=True)      # шүршүүрийн өрөө (дарааллын тасалбар үед NULL)
    item_type   = Column(String(20), default="service")   # 'service' | 'product' | 'room'
    item_name   = Column(String(100), nullable=True)      # name snapshot at time of order

    quantity    = Column(Integer, default=1)
    unit_price  = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    notes       = Column(String(255), nullable=True)   # "Цагаан өнгийн цамц"

    order       = relationship("Order", back_populates="items")
    service     = relationship("Service", back_populates="order_items", foreign_keys=[service_id])
    product     = relationship("InventoryItem", foreign_keys=[product_id])
    room        = relationship("Room", foreign_keys=[room_id])


# ── Inventory (Бараа материал) ─────────────────────────
class InventoryItem(Base):
    __tablename__ = "inventory"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)
    unit         = Column(String(20), default="кг")   # кг / литр / ширхэг
    quantity     = Column(Float, default=0.0)
    min_quantity = Column(Float, default=1.0)          # Анхааруулах хэмжээ
    cost_price   = Column(Float, default=0.0)
    sale_price   = Column(Float, default=0.0)          # POS дээр зарах үнэ
    is_for_sale  = Column(Boolean, default=False)      # POS-оос зарж болох эсэх
    supplier     = Column(String(100), nullable=True)
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


# ── User (Хэрэглэгч) ───────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, index=True, nullable=False)
    full_name     = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), default="cashier", nullable=False)   # "admin" | "cashier" | "cleaner"
    is_active     = Column(Boolean, default=True, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


# ── CashierShift (Кассын ээлж) ─────────────────────────
class CashierShift(Base):
    __tablename__ = "cashier_shifts"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at      = Column(DateTime(timezone=True), default=_now_local)
    ended_at        = Column(DateTime(timezone=True), nullable=True)
    status          = Column(String(20), default="active")  # active | ended

    user            = relationship("User")


# ── Coupon (Купон) ─────────────────────────────────────
class Coupon(Base):
    __tablename__ = "coupons"

    id            = Column(Integer, primary_key=True, index=True)
    code          = Column(String(50), unique=True, index=True)
    discount_type = Column(String(20))    # percent | amount
    discount_value= Column(Float)
    min_amount    = Column(Float, default=0.0)
    max_uses      = Column(Integer, nullable=True)
    used_count    = Column(Integer, default=0)
    is_active     = Column(Boolean, default=True)
    expires_at    = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


# ── Machine (Физик машин) ─────────────────────────────────
class Machine(Base):
    __tablename__ = "machines"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)        # "Угаалга #1"
    machine_type = Column(String(20), nullable=False)         # washer / dryer / shoe_washer
    is_active    = Column(Boolean, default=True)

    usages       = relationship("MachineUsage", back_populates="machine")


# ── MachineUsage (Машин ашиглалт) ─────────────────────────
class MachineUsage(Base):
    __tablename__ = "machine_usages"

    id            = Column(Integer, primary_key=True, index=True)
    machine_id    = Column(Integer, ForeignKey("machines.id"), nullable=False)
    order_id      = Column(Integer, ForeignKey("orders.id"), nullable=False)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=True)
    sub_index     = Column(Integer, default=0)                # quantity дотор хэддэх нь
    customer_name = Column(String(100), nullable=True)        # snapshot
    service_name  = Column(String(100), nullable=True)        # snapshot
    duration_min  = Column(Integer, nullable=False)
    started_at    = Column(DateTime(timezone=True), server_default=func.now())
    ended_at      = Column(DateTime(timezone=True), nullable=True)
    status        = Column(String(20), default="running")     # running / completed

    machine       = relationship("Machine", back_populates="usages")
    order         = relationship("Order")


# ── Шүршүүр: статусын тогтмолууд ──────────────────────────
# waiting → reserved → in_use → awaiting_cleaning → cleaning → completed | cancelled
# Өрөө эзэлж буй статусууд (эдгээрийн аль нэг нь байвал өрөө сул биш)
ROOM_OCCUPYING_STATUSES = ("reserved", "in_use", "awaiting_cleaning", "cleaning")
SESSION_ACTIVE_STATUSES = ("waiting",) + ROOM_OCCUPYING_STATUSES


# ── RoomType (Өрөөний төрөл: 1 хүний / 2 хүний / Саун) ────
class RoomType(Base):
    __tablename__ = "room_types"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)           # "1 хүний"
    price        = Column(Float, nullable=False)                 # тогтмол үнэ
    duration_min = Column(Integer, default=60, nullable=False)   # стандарт хугацаа
    color        = Column(String(20), default="#38bdf8")         # зураглал дээрх өнгө
    sort_order   = Column(Integer, default=0)
    is_active    = Column(Boolean, default=True)

    rooms        = relationship("Room", back_populates="room_type")


# ── Room (Шүршүүрийн өрөө) ────────────────────────────────
class Room(Base):
    __tablename__ = "rooms"

    id           = Column(Integer, primary_key=True, index=True)
    number       = Column(String(20), unique=True, nullable=False)   # "1", "2", "A1"
    room_type_id = Column(Integer, ForeignKey("room_types.id"), nullable=False)
    is_active    = Column(Boolean, default=True)

    # Зураглал дээрх байрлал (24×14 виртуал grid). Бүгд NULL = байрлуулаагүй
    map_x        = Column(Integer, nullable=True)
    map_y        = Column(Integer, nullable=True)
    map_w        = Column(Integer, nullable=True)
    map_h        = Column(Integer, nullable=True)

    room_type    = relationship("RoomType", back_populates="rooms", lazy="joined")
    sessions     = relationship("RoomSession", back_populates="room",
                                foreign_keys="RoomSession.room_id")


# ── RoomSession (Нэг худалдан авалт = нэг session) ─────────
class RoomSession(Base):
    __tablename__ = "room_sessions"

    id            = Column(Integer, primary_key=True, index=True)
    room_id       = Column(Integer, ForeignKey("rooms.id"), nullable=True)         # waiting үед NULL
    room_type_id  = Column(Integer, ForeignKey("room_types.id"), nullable=False)   # юуны төлбөр төлсөн
    order_id      = Column(Integer, ForeignKey("orders.id"), nullable=False)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=True)
    queue_no      = Column(Integer, nullable=False, default=0)   # өдрийн дарааллын дугаар (Ш-07)

    # snapshot
    room_number   = Column(String(20), nullable=True)     # өрөө оноогдох үед бөглөгдөнө
    type_name     = Column(String(100), nullable=True)
    customer_name = Column(String(100), nullable=True)
    price         = Column(Float, nullable=False)
    duration_min  = Column(Integer, nullable=False)

    status        = Column(String(20), default="waiting", index=True)

    created_at          = Column(DateTime(timezone=True), default=_now_local)  # = төлсөн цаг (FIFO)
    started_at          = Column(DateTime(timezone=True), nullable=True)       # Эхлүүлэх
    ended_at            = Column(DateTime(timezone=True), nullable=True)       # Гарсан / цуцлагдсан
    cleaning_started_at = Column(DateTime(timezone=True), nullable=True)
    cleaned_at          = Column(DateTime(timezone=True), nullable=True)
    cleaned_by_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    cleaned_by          = Column(String(100), nullable=True)

    room       = relationship("Room", back_populates="sessions", foreign_keys=[room_id])
    room_type  = relationship("RoomType")
    order      = relationship("Order")

    # Нэг өрөөнд зэрэг ганцхан идэвхтэй session — давхар захиалгын хамгаалалт
    __table_args__ = (
        Index(
            "ux_room_sessions_active_room", "room_id", unique=True,
            sqlite_where=sa_text(
                "status IN ('reserved','in_use','awaiting_cleaning','cleaning') "
                "AND room_id IS NOT NULL"
            ),
        ),
    )


# ═══════════════════════════════════════════════════════════
#  Санхүү (хялбаршуулсан — давхар бичилтгүй)
# ═══════════════════════════════════════════════════════════

# ── FinAccount (Мөнгөн данс: Касс, Банк …) ────────────────
class FinAccount(Base):
    __tablename__ = "fin_accounts"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)     # "Касс", "Хаан банк" …
    sort_order   = Column(Integer, default=0)
    is_active    = Column(Boolean, default=True)
    # POS-ийн аль төлбөрийн хэлбэр энэ данс руу ордог вэ (данс бүрт нэгээс олон байж болно,
    # харин нэг төлбөрийн хэлбэр зөвхөн нэг дансанд холбогдоно — router талд шалгана)
    pos_cash     = Column(Boolean, default=False)
    pos_transfer = Column(Boolean, default=False)
    pos_card     = Column(Boolean, default=False)


# ── Supplier (Нийлүүлэгч) ─────────────────────────────────
class Supplier(Base):
    __tablename__ = "suppliers"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    phone      = Column(String(20), nullable=True)
    notes      = Column(Text, nullable=True)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now_local)


# ── PurchaseDoc (Бараа материалын орлого) ─────────────────
class PurchaseDoc(Base):
    __tablename__ = "purchases"

    id            = Column(Integer, primary_key=True, index=True)
    doc_number    = Column(String(20), unique=True, index=True)   # PUR-20260810-001
    doc_date      = Column(DateTime(timezone=True), default=_now_local)
    supplier_id   = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name = Column(String(100), nullable=True)            # snapshot
    description   = Column(Text, nullable=True)                   # гүйлгээний утга
    payment_type  = Column(String(20), default="paid")            # 'paid' (данснаас) | 'credit' (өглөгөөр)
    account_id    = Column(Integer, ForeignKey("fin_accounts.id"), nullable=True)  # paid үед
    total         = Column(Float, default=0.0)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by    = Column(String(100), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now_local)

    supplier      = relationship("Supplier")
    account       = relationship("FinAccount")
    items         = relationship("PurchaseItem", back_populates="purchase",
                                 cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id          = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    product_id  = Column(Integer, ForeignKey("inventory.id"), nullable=False)
    item_name   = Column(String(100), nullable=True)    # snapshot
    location    = Column(String(100), nullable=True)    # байршил (агуулах г.м.)
    quantity    = Column(Float, nullable=False)
    unit_cost   = Column(Float, nullable=False)
    total       = Column(Float, nullable=False)

    purchase    = relationship("PurchaseDoc", back_populates="items")
    product     = relationship("InventoryItem")


# ── DebtEntry (Авлага / Өглөгийн тооцоо) ──────────────────
# kind: 'receivable' = бидэнд өртэй (авлага) | 'payable' = бид өртэй (өглөг)
class DebtEntry(Base):
    __tablename__ = "debt_entries"

    id            = Column(Integer, primary_key=True, index=True)
    kind          = Column(String(20), nullable=False, index=True)
    partner_type  = Column(String(20), default="other")   # customer | supplier | employee | other
    partner_id    = Column(Integer, nullable=True)
    partner_name  = Column(String(100), nullable=False)
    description   = Column(Text, nullable=True)
    amount        = Column(Float, nullable=False)
    paid_amount   = Column(Float, default=0.0)
    status        = Column(String(20), default="open", index=True)   # open | closed
    doc_date      = Column(DateTime(timezone=True), default=_now_local)
    purchase_id   = Column(Integer, ForeignKey("purchases.id"), nullable=True)  # өглөгөөр авсан худалдан авалт
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by    = Column(String(100), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now_local)
    closed_at     = Column(DateTime(timezone=True), nullable=True)

    purchase      = relationship("PurchaseDoc")


# ── FinTransaction (Кассын журнал — орлого / зарлага) ─────
class FinTransaction(Base):
    __tablename__ = "fin_transactions"

    id            = Column(Integer, primary_key=True, index=True)
    doc_date      = Column(DateTime(timezone=True), default=_now_local)
    direction     = Column(String(10), nullable=False, index=True)   # income | expense
    account_id    = Column(Integer, ForeignKey("fin_accounts.id"), nullable=False)
    category      = Column(String(50), default="Бусад")   # Цалин, Түрээс, Худалдан авалт …
    partner_type  = Column(String(20), nullable=True)
    partner_id    = Column(Integer, nullable=True)
    partner_name  = Column(String(100), nullable=True)
    description   = Column(Text, nullable=True)           # гүйлгээний утга
    amount        = Column(Float, nullable=False)
    purchase_id   = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    debt_id       = Column(Integer, ForeignKey("debt_entries.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by    = Column(String(100), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now_local)

    account       = relationship("FinAccount")
    debt          = relationship("DebtEntry")
