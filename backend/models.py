from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text, Enum, Table
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
    item_type   = Column(String(20), default="service")   # 'service' | 'product'
    item_name   = Column(String(100), nullable=True)      # name snapshot at time of order

    quantity    = Column(Integer, default=1)
    unit_price  = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    notes       = Column(String(255), nullable=True)   # "Цагаан өнгийн цамц"

    order       = relationship("Order", back_populates="items")
    service     = relationship("Service", back_populates="order_items", foreign_keys=[service_id])
    product     = relationship("InventoryItem", foreign_keys=[product_id])


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
    role          = Column(String(20), default="cashier", nullable=False)   # "admin" | "cashier"
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
