from pydantic import BaseModel, field_validator, field_serializer
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum


def _utc_iso(v: datetime) -> str:
    """Datetime-г ISO 8601 форматаар буцаана."""
    if v is None:
        return None
    return v.strftime('%Y-%m-%dT%H:%M:%S+08:00')


# ── Enums ──────────────────────────────────────────────
class OrderStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    WASHING    = "washing"      # backward compat
    IRONING    = "ironing"      # backward compat
    READY      = "ready"
    DELIVERED  = "delivered"

class PaymentMethod(str, Enum):
    CASH       = "cash"
    CARD       = "card"
    TRANSFER   = "transfer"
    POINTS     = "points"
    MIXED      = "mixed"
    UNPAID     = "unpaid"

class DiscountType(str, Enum):
    PERCENT = "percent"
    AMOUNT  = "amount"


# ── Customer ───────────────────────────────────────────
class CustomerCreate(BaseModel):
    name:  str
    phone: str
    email: Optional[str] = None

class CustomerUpdate(BaseModel):
    name:  Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class CustomerOut(BaseModel):
    id:            int
    name:          str
    phone:         str
    email:         Optional[str]
    points:        int
    total_spent:   float
    created_at:    datetime
    warning_count: int = 0    # Анхааруулгатай захиалгын тоо (computed)
    warning_total: float = 0  # Анхааруулгатай төлөгдөөгүй дүн (computed)

    @field_serializer('created_at')
    def _ser_created_at(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


# ── Category ───────────────────────────────────────────
class CategoryCreate(BaseModel):
    value:        str
    label:        str
    color:        str = "from-gray-400 to-gray-600"
    badge_color:  str = "bg-gray-100 text-gray-600"
    sort_order:   int = 0
    machine_type: Optional[str] = None   # washer / dryer / shoe_washer

class CategoryUpdate(BaseModel):
    label:        Optional[str] = None
    color:        Optional[str] = None
    badge_color:  Optional[str] = None
    sort_order:   Optional[int] = None
    machine_type: Optional[str] = None

class CategoryOut(BaseModel):
    id:           int
    value:        str
    label:        str
    color:        str
    badge_color:  str
    sort_order:   int
    machine_type: Optional[str]

    class Config:
        from_attributes = True


# ── Service ────────────────────────────────────────────
class ServiceCreate(BaseModel):
    code:         str
    name:         str
    name_en:      Optional[str] = None
    price:        float
    unit:         str = "ширхэг"
    category:     str = "general"
    duration_min: int = 60
    points_earn:  int = 1
    image_url:    Optional[str] = None
    machine_ids:  List[int] = []

class ServiceUpdate(BaseModel):
    name:         Optional[str]   = None
    price:        Optional[float] = None
    unit:         Optional[str]   = None
    category:     Optional[str]   = None
    duration_min: Optional[int]   = None
    is_active:    Optional[bool]  = None
    machine_ids:  Optional[List[int]] = None

class ServiceOut(BaseModel):
    id:           int
    code:         str
    name:         str
    name_en:      Optional[str]
    price:        float
    unit:         str
    category:     str
    duration_min: int
    points_earn:  int
    is_active:    bool
    image_url:    Optional[str]
    machine_ids:  List[int] = []

    class Config:
        from_attributes = True


# ── Inventory Brief (used inside OrderItemOut) ─────────
class InventoryBriefOut(BaseModel):
    id:         int
    name:       str
    unit:       str
    sale_price: float

    class Config:
        from_attributes = True


# ── Order Item ─────────────────────────────────────────
class OrderItemCreate(BaseModel):
    service_id:   Optional[int] = None   # үйлчилгээний захиалга
    product_id:   Optional[int] = None   # бараа зарах
    tariff_id:    Optional[int] = None   # шүршүүр — хүний төрлийн тасалбар
    quantity:     int = 1
    notes:        Optional[str] = None

class OrderItemOut(BaseModel):
    id:          int
    service_id:  Optional[int]
    product_id:  Optional[int]
    room_id:     Optional[int] = None
    item_type:   str = "service"
    item_name:   Optional[str]
    quantity:    int
    unit_price:  float
    total_price: float
    notes:       Optional[str]
    service:     Optional[ServiceOut]
    product:     Optional[InventoryBriefOut]

    class Config:
        from_attributes = True


# ── Order ──────────────────────────────────────────────
class OrderCreate(BaseModel):
    customer_id:     Optional[int]        = None
    phone:           Optional[str]        = None   # SMS явуулах дугаар (харилцагчгүй захиалгад)
    items:           List[OrderItemCreate]
    discount_type:   Optional[DiscountType] = None
    discount_value:  Optional[float]      = 0.0
    payment_method:  PaymentMethod        = PaymentMethod.CASH
    payment_details: Optional[str]        = None   # JSON for mixed: '{"cash":10000,"transfer":20000}'
    points_used:     int                  = 0
    product_vat:     bool                 = False   # бараа материалд НӨАТ нэмэх эсэх
    notes:           Optional[str]        = None
    cashier_name:    str                  = "Кассчин"

class OrderStatusUpdate(BaseModel):
    status: OrderStatus

class OrderPayRequest(BaseModel):
    payment_method:  PaymentMethod
    payment_details: Optional[str] = None
    points_used:     int = 0

class OrderFlagRequest(BaseModel):
    """Анхааруулгын жагсаалтад нэмэх (төлбөр төлөлгүй явсан)"""
    reason: Optional[str] = None

class OrderSessionBrief(BaseModel):
    """Захиалгаас үүссэн шүршүүрийн тасалбар — хэвлэхэд ашиглана."""
    id:            int
    queue_no:      int
    order_item_id: Optional[int] = None   # аль мөрөөс үүссэн — түүхэнд харуулна
    type_name:     Optional[str] = None   # тарифын нэр ("Том хүн")
    price:        float                   # НӨАТ БАГТСАН үнэ
    # Хугацаа өрөө оноогдох үед л тодорно (өрөөний төрлөөс) — тасалбар
    # хэвлэх үед 0 байна.
    duration_min: int = 0
    status:       str

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id:               int
    order_number:     str
    customer_id:      Optional[int]
    customer:         Optional[CustomerOut]
    phone:            Optional[str]
    cashier_name:     str
    subtotal:         float
    discount_type:    Optional[str]
    discount_value:   float
    discount_amount:  float
    vat_amount:       float = 0.0   # дүнд БАГТСАН НӨАТ (нэмэгдэхгүй)
    product_vat:      bool = False
    total:            float
    payment_method:   str
    payment_details:  Optional[str]
    points_used:      int
    points_earned:    int
    is_paid:          bool
    paid_at:          Optional[datetime] = None
    paid_by:          Optional[str] = None
    status:           str
    notes:            Optional[str]
    created_at:       datetime
    deleted_at:       Optional[datetime] = None
    is_flagged:       bool = False
    flagged_at:       Optional[datetime] = None
    flagged_reason:   Optional[str] = None
    flagged_by:       Optional[str] = None
    items:            List[OrderItemOut]
    sessions:         List[OrderSessionBrief] = []   # шүршүүрийн тасалбарууд

    @field_serializer('created_at')
    def _ser_created_at(self, v): return _utc_iso(v)

    @field_serializer('deleted_at')
    def _ser_deleted_at(self, v): return _utc_iso(v)

    @field_serializer('flagged_at')
    def _ser_flagged_at(self, v): return _utc_iso(v)

    @field_serializer('paid_at')
    def _ser_paid_at(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


# ── Inventory ──────────────────────────────────────────
# ── Барааны ангилал (үйлчилгээнийхээс ТУСДАА) ──────────
class ProductCategoryCreate(BaseModel):
    name:       str
    color:      str = "#38bdf8"
    sort_order: int = 0

class ProductCategoryUpdate(BaseModel):
    name:       Optional[str]  = None
    color:      Optional[str]  = None
    sort_order: Optional[int]  = None
    is_active:  Optional[bool] = None

class ProductCategoryOut(BaseModel):
    id:         int
    name:       str
    color:      str
    sort_order: int
    is_active:  bool

    class Config:
        from_attributes = True


class InventoryCreate(BaseModel):
    name:         str
    unit:         str = "кг"
    quantity:     float = 0.0
    min_quantity: float = 1.0
    cost_price:   float = 0.0
    sale_price:   float = 0.0
    is_for_sale:  bool = False
    supplier:     Optional[str] = None
    category_id:  Optional[int] = None

class InventoryUpdate(BaseModel):
    name:         Optional[str]   = None
    unit:         Optional[str]   = None
    quantity:     Optional[float] = None
    min_quantity: Optional[float] = None
    cost_price:   Optional[float] = None
    sale_price:   Optional[float] = None
    is_for_sale:  Optional[bool]  = None
    supplier:     Optional[str]   = None
    category_id:  Optional[int]   = None

class InventoryOut(BaseModel):
    id:           int
    name:         str
    unit:         str
    quantity:     float
    min_quantity: float
    cost_price:   float
    sale_price:   float
    is_for_sale:  bool
    supplier:     Optional[str]
    category_id:  Optional[int] = None
    category:     Optional[ProductCategoryOut] = None
    updated_at:   Optional[datetime]
    is_low:       bool = False   # computed

    class Config:
        from_attributes = True


# ── Coupon ─────────────────────────────────────────────
class CouponCreate(BaseModel):
    code:          str
    discount_type: DiscountType
    discount_value: float
    min_amount:    float = 0.0
    max_uses:      Optional[int] = None
    expires_at:    Optional[datetime] = None

class CouponValidate(BaseModel):
    code:   str
    amount: float

class CouponOut(BaseModel):
    id:             int
    code:           str
    discount_type:  str
    discount_value: float
    min_amount:     float
    max_uses:       Optional[int]
    used_count:     int
    is_active:      bool
    expires_at:     Optional[datetime] = None
    created_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


# ── User / Auth ────────────────────────────────────────
class UserRole(str, Enum):
    admin      = "admin"
    accountant = "accountant"   # Нягтлан — бүх салбарт хүчинтэй
    cashier    = "cashier"
    cleaner    = "cleaner"      # Үйлчлэгч (цэвэрлэгээ)


class CashierScope(str, Enum):
    laundry = "laundry"    # зөвхөн угаалга
    shower  = "shower"     # зөвхөн шүршүүр
    master  = "master"     # Мастер кассчин — хоёулаа


class UserCreate(BaseModel):
    username:  str
    full_name: str
    password:  str
    role:      UserRole = UserRole.cashier
    cashier_scope: CashierScope = CashierScope.master


class UserUpdate(BaseModel):
    full_name: Optional[str]      = None
    role:      Optional[UserRole] = None
    is_active: Optional[bool]     = None
    cashier_scope: Optional[CashierScope] = None


class UserPasswordReset(BaseModel):
    new_password: str


class UserOut(BaseModel):
    id:         int
    username:   str
    full_name:  str
    role:       str
    # Глобал хэрэглэгч (админ/нягтлан) — бүх салбарт хүчинтэй, салбарын
    # хэрэглэгчийн цэснээс засах/устгах боломжгүй
    is_global:  bool = False
    cashier_scope: str = "master"
    is_active:  bool
    created_at: datetime

    @field_serializer('created_at')
    def _ser_created_at(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str     = "bearer"
    user:         UserOut
    branch_code:  str = ""     # аль салбарт нэвтэрсэн
    branch_name:  str = ""


# ── Report ─────────────────────────────────────────────
class DailySummary(BaseModel):
    date:          str
    total_orders:  int
    total_revenue: float
    cash:          float
    card:          float
    social_pay:    float
    points:        float

class ReportFilter(BaseModel):
    start_date: str   # YYYY-MM-DD
    end_date:   str


# ── CashierShift (Ээлж) ───────────────────────────────────
class ShiftOut(BaseModel):
    id:          int
    user_id:     int
    user:        Optional[UserOut] = None
    scope:       str = "master"          # laundry | shower | master
    started_at:  datetime
    ended_at:    Optional[datetime] = None
    status:      str

    @field_serializer('started_at')
    def _ser_started(self, v): return _utc_iso(v)

    @field_serializer('ended_at')
    def _ser_ended(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


class ShiftSummary(BaseModel):
    shift:          ShiftOut
    total_orders:   int
    total_customers: int
    total_revenue:  float     # бодитоор орсон мөнгө (бэлэн + шилжүүлэг + карт)
    cash_total:     float
    transfer_total: float
    card_total:     float
    unpaid_total:   float = 0.0   # төлбөр төлөөгүй үлдэгдэл
    late_total:     float = 0.0   # нөхөж авсан төлбөр (өмнөх өдрийн захиалга)
    # ── Задаргаа (кассд мөнгө болж ОРООГҮЙ хөнгөлөлт + төрлийн ангилал) ──
    points_total:   float = 0.0   # оноогоор хасагдсан дүн
    discount_total: float = 0.0   # хямдралаар хасагдсан дүн
    vat_total:      float = 0.0   # дүнд багтсан НӨАТ
    shower_total:   float = 0.0   # шүршүүрийн мөрүүдийн дүн
    laundry_total:  float = 0.0   # угаалгын үйлчилгээний дүн
    product_total:  float = 0.0   # бараа материалын дүн


class ShiftState(BaseModel):
    """POS нээгдэх эсэхийг шийддэг төлөв (GET /shifts/my)."""
    requires_shift: bool                        # кассчин мөн үү
    scope:          str                         # laundry | shower | master
    scope_label:    str                         # "Угаалга" гэх мэт
    shift:          Optional[ShiftOut] = None   # өөрийн идэвхтэй ээлж
    blocked_by:     Optional[ShiftOut] = None   # саад болж буй өөр кассын ээлж


# ── Machine (Машин) ───────────────────────────────────────
class MachineType(str, Enum):
    WASHER      = "washer"
    DRYER       = "dryer"
    SHOE_WASHER = "shoe_washer"


class MachineCreate(BaseModel):
    name:         str
    machine_type: MachineType


class MachineUpdate(BaseModel):
    name:         Optional[str]  = None
    machine_type: Optional[MachineType] = None
    is_active:    Optional[bool] = None


class MachineUsageOut(BaseModel):
    id:            int
    machine_id:    int
    order_id:      int
    order_item_id: Optional[int]
    sub_index:     int = 0
    customer_name: Optional[str]
    service_name:  Optional[str]
    duration_min:  int
    started_at:    datetime
    ended_at:      Optional[datetime]
    status:        str

    @field_serializer('started_at')
    def _ser_started(self, v): return _utc_iso(v)

    @field_serializer('ended_at')
    def _ser_ended(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


class MachineOut(BaseModel):
    id:            int
    name:          str
    machine_type:  str
    is_active:     bool
    current_usage: Optional[MachineUsageOut] = None

    class Config:
        from_attributes = True


class AssignMachineRequest(BaseModel):
    order_id:      int
    order_item_id: int
    sub_index:     int = 0  # quantity дотор хэддэх нь (0-based)
    duration_min:  int      # үйлчилгээний хугацаа (минут)


class DailyMachineSummary(BaseModel):
    machine_id:     int
    machine_name:   str
    total_services: int
    total_minutes:  int


# ── Шүршүүр: Хүний төрлийн тариф ──────────────────────────
# Үнэ ЭНД байна — өрөө биш, хүн тус бүрээр төлбөр тооцно.
class ShowerTariffCreate(BaseModel):
    name:         str
    price:        float          # НӨАТ БАГТСАН үнэ
    color:        str = "#38bdf8"
    sort_order:   int = 0


class ShowerTariffUpdate(BaseModel):
    name:         Optional[str]   = None
    price:        Optional[float] = None
    color:        Optional[str]   = None
    sort_order:   Optional[int]   = None
    is_active:    Optional[bool]  = None


class ShowerTariffOut(BaseModel):
    id:           int
    name:         str
    price:        float
    color:        str
    sort_order:   int
    is_active:    bool

    class Config:
        from_attributes = True


# ── Шүршүүр: Өрөөний төрөл (тарифгүй — зөвхөн багтаамж) ───
class RoomTypeCreate(BaseModel):
    name:         str
    duration_min: int = 60
    color:        str = "#38bdf8"
    sort_order:   int = 0


class RoomTypeUpdate(BaseModel):
    name:         Optional[str]   = None
    duration_min: Optional[int]   = None
    color:        Optional[str]   = None
    sort_order:   Optional[int]   = None
    is_active:    Optional[bool]  = None


class RoomTypeOut(BaseModel):
    id:           int
    name:         str
    duration_min: int
    color:        str
    sort_order:   int
    is_active:    bool

    class Config:
        from_attributes = True


# ── Шүршүүр: Өрөө ─────────────────────────────────────────
class RoomCreate(BaseModel):
    number:       str
    room_type_id: int


class RoomUpdate(BaseModel):
    number:       Optional[str]  = None
    room_type_id: Optional[int]  = None
    is_active:    Optional[bool] = None


class RoomLayoutItem(BaseModel):
    id:    int
    map_x: Optional[int] = None
    map_y: Optional[int] = None
    map_w: Optional[int] = None
    map_h: Optional[int] = None


class RoomLayoutUpdate(BaseModel):
    items: List[RoomLayoutItem]


class RoomAssignRequest(BaseModel):
    """Нэг буюу хэд хэдэн тасалбарыг НЭГ өрөөнд оруулах.
    (Гэр бүл хамт орох боломжтой болсон тул жагсаалт авна.)"""
    session_ids: List[int]
    room_id:     int


class RoomSessionOut(BaseModel):
    id:                  int
    room_id:             Optional[int]
    room_type_id:        Optional[int] = None   # өрөө оноогдох үед бөглөгдөнө
    tariff_id:           Optional[int] = None
    order_id:            int
    order_item_id:       Optional[int]
    queue_no:            int
    room_number:         Optional[str]
    type_name:           Optional[str]
    customer_name:       Optional[str]
    price:               float
    duration_min:        int
    status:              str
    no_show:             bool = False
    created_at:          datetime
    started_at:          Optional[datetime] = None
    ended_at:            Optional[datetime] = None
    cleaning_started_at: Optional[datetime] = None
    cleaned_at:          Optional[datetime] = None
    cleaned_by:          Optional[str] = None

    # Таймер зөв ажиллахын тулд бүх datetime-д ижил serializer
    @field_serializer('created_at')
    def _ser_created(self, v): return _utc_iso(v)

    @field_serializer('started_at')
    def _ser_started(self, v): return _utc_iso(v)

    @field_serializer('ended_at')
    def _ser_ended(self, v): return _utc_iso(v)

    @field_serializer('cleaning_started_at')
    def _ser_cleaning_started(self, v): return _utc_iso(v)

    @field_serializer('cleaned_at')
    def _ser_cleaned(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


class RoomOut(BaseModel):
    id:             int
    number:         str
    room_type_id:   int
    is_active:      bool
    map_x:          Optional[int] = None
    map_y:          Optional[int] = None
    map_w:          Optional[int] = None
    map_h:          Optional[int] = None
    room_type:      Optional[RoomTypeOut]    = None
    # Өрөөнд зэрэг олон хүн байж болно. active_session нь хамгийн урт
    # хугацаатай оршин суугч — таймер/статус харуулахад төлөөлөгч болно.
    active_session:  Optional[RoomSessionOut]  = None   # тооцоолсон
    active_sessions: List[RoomSessionOut]      = []     # тооцоолсон

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════
#  Санхүү
# ═══════════════════════════════════════════════════════════

# ── Мөнгөн данс ────────────────────────────────────────────
class FinAccountCreate(BaseModel):
    name:         str
    sort_order:   int = 0
    pos_cash:     bool = False
    pos_transfer: bool = False
    pos_card:     bool = False


class FinAccountUpdate(BaseModel):
    name:         Optional[str]  = None
    sort_order:   Optional[int]  = None
    is_active:    Optional[bool] = None
    pos_cash:     Optional[bool] = None
    pos_transfer: Optional[bool] = None
    pos_card:     Optional[bool] = None


class FinAccountOut(BaseModel):
    id:           int
    name:         str
    sort_order:   int
    is_active:    bool
    pos_cash:     bool
    pos_transfer: bool
    pos_card:     bool
    balance:      float = 0.0   # тооцоолсон

    class Config:
        from_attributes = True


# ── Нийлүүлэгч ─────────────────────────────────────────────
class SupplierCreate(BaseModel):
    name:  str
    phone: Optional[str] = None
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name:      Optional[str]  = None
    phone:     Optional[str]  = None
    notes:     Optional[str]  = None
    is_active: Optional[bool] = None


class SupplierOut(BaseModel):
    id:              int
    name:            str
    phone:           Optional[str]
    notes:           Optional[str]
    is_active:       bool
    payable_balance: float = 0.0   # нээлттэй өглөгийн үлдэгдэл (тооцоолсон)

    class Config:
        from_attributes = True


# ── Худалдан авалт ─────────────────────────────────────────
class PurchaseItemCreate(BaseModel):
    product_id: int
    location:   Optional[str] = None
    quantity:   float
    unit_cost:  float


class PurchaseItemOut(BaseModel):
    id:         int
    product_id: int
    item_name:  Optional[str]
    location:   Optional[str]
    quantity:   float
    unit_cost:  float
    total:      float

    class Config:
        from_attributes = True


class PurchaseCreate(BaseModel):
    doc_date:     Optional[str] = None    # YYYY-MM-DD (хоосон бол өнөөдөр)
    supplier_id:  Optional[int] = None
    description:  Optional[str] = None
    payment_type: str = "paid"            # 'paid' | 'credit'
    account_id:   Optional[int] = None    # paid үед заавал
    items:        List[PurchaseItemCreate]


class PurchaseOut(BaseModel):
    id:            int
    doc_number:    str
    doc_date:      datetime
    supplier_id:   Optional[int]
    supplier_name: Optional[str]
    description:   Optional[str]
    payment_type:  str
    account_id:    Optional[int]
    total:         float
    created_by:    Optional[str]
    items:         List[PurchaseItemOut]

    @field_serializer('doc_date')
    def _ser_doc_date(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


# ── Авлага / Өглөг ─────────────────────────────────────────
class DebtCreate(BaseModel):
    kind:         str                     # 'receivable' | 'payable'
    partner_type: str = "other"           # customer | supplier | employee | other
    partner_id:   Optional[int] = None
    partner_name: str
    description:  Optional[str] = None
    amount:       float
    doc_date:     Optional[str] = None    # YYYY-MM-DD


class DebtPayRequest(BaseModel):
    amount:      float
    account_id:  int
    doc_date:    Optional[str] = None
    description: Optional[str] = None


class DebtOut(BaseModel):
    id:           int
    kind:         str
    partner_type: str
    partner_id:   Optional[int]
    partner_name: str
    description:  Optional[str]
    amount:       float
    paid_amount:  float
    status:       str
    doc_date:     datetime
    purchase_id:  Optional[int]
    created_by:   Optional[str]
    closed_at:    Optional[datetime] = None

    @field_serializer('doc_date')
    def _ser_doc_date(self, v): return _utc_iso(v)

    @field_serializer('closed_at')
    def _ser_closed_at(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True


# ── Кассын журнал ──────────────────────────────────────────
class FinTxCreate(BaseModel):
    direction:    str                     # 'income' | 'expense'
    account_id:   int
    category:     str = "Бусад"
    partner_type: Optional[str] = None
    partner_id:   Optional[int] = None
    partner_name: Optional[str] = None
    description:  Optional[str] = None
    amount:       float
    doc_date:     Optional[str] = None    # YYYY-MM-DD


class FinTxOut(BaseModel):
    id:           int
    doc_date:     datetime
    direction:    str
    account_id:   int
    category:     str
    partner_type: Optional[str]
    partner_name: Optional[str]
    description:  Optional[str]
    amount:       float
    purchase_id:  Optional[int]
    debt_id:      Optional[int]
    created_by:   Optional[str]

    @field_serializer('doc_date')
    def _ser_doc_date(self, v): return _utc_iso(v)

    class Config:
        from_attributes = True
