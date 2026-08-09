import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, RefreshCw, User, Phone, Banknote, Package,
  ChevronDown, ShieldCheck, Search, CheckCircle2, Calendar, UserCog,
} from 'lucide-react'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { ordersApi } from '../api/client'
import useAuthStore from '../store/useAuthStore'
import PayModal from '../components/PayModal'

const STATUS_LABELS = {
  pending:    'Хүлээгдэж байна',
  processing: 'Үйлчилгээ хийгдэж байна',
  washing:    'Угааж байна',
  ironing:    'Индүүдэж байна',
  ready:      'Бэлэн',
  delivered:  'Олгосон',
  archived:   'Архивласан',
}

// Анхааруулгад орсон огноогоор (flagged_at) шүүнэ. Default = өнөөдөр.
const QUICK_FILTERS = [
  { label: 'Өнөөдөр', range: () => ({ from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { label: 'Өчигдөр', range: () => ({ from: dayjs().subtract(1,'day').format('YYYY-MM-DD'), to: dayjs().subtract(1,'day').format('YYYY-MM-DD') }) },
  { label: '7 хоног', range: () => ({ from: dayjs().subtract(6,'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { label: 'Энэ сар', range: () => ({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { label: 'Бүгд',    range: () => ({ from: '', to: '' }) },
]

export default function WarningsPage() {
  const isAdmin = useAuthStore(s => s.isAdmin)()
  const today = dayjs().format('YYYY-MM-DD')

  const [orders,    setOrders]    = useState([])   // шүүлтээр
  const [allOrders, setAllOrders] = useState([])   // бүх хугацаа — касс сонголт + нийт өр
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  const [dateFrom,    setDateFrom]    = useState(today)
  const [dateTo,      setDateTo]      = useState(today)
  const [cashier,     setCashier]     = useState('')   // '' = бүх касс
  const [activeQuick, setActiveQuick] = useState(0)

  const fetchFiltered = useCallback(async (from, to, cash) => {
    setLoading(true)
    const params = {}
    if (from) params.date_from = from
    if (to)   params.date_to   = to
    if (cash) params.cashier_name = cash
    try {
      const res = await ordersApi.flagged(params)
      setOrders(res.data || [])
    } catch {
      /* interceptor-аар алдаа харагдана */
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const res = await ordersApi.flagged()
      setAllOrders(res.data || [])
    } catch { setAllOrders([]) }
  }, [])

  const refresh = useCallback(() => {
    fetchAll()
    fetchFiltered(dateFrom, dateTo, cashier)
  }, [fetchAll, fetchFiltered, dateFrom, dateTo, cashier])

  useEffect(() => { fetchAll(); fetchFiltered(today, today, '') }, [])

  const applyQuick = (idx) => {
    const { from, to } = QUICK_FILTERS[idx].range()
    setDateFrom(from); setDateTo(to); setActiveQuick(idx)
    fetchFiltered(from, to, cashier)
  }

  const applyCustom = () => {
    setActiveQuick(null)
    fetchFiltered(dateFrom, dateTo, cashier)
  }

  const changeCashier = (name) => {
    setCashier(name)
    fetchFiltered(dateFrom, dateTo, name)
  }

  // Кассын сонголт — бүх анхааруулгатай захиалгаас
  const cashierOptions = [...new Set(allOrders.map(o => o.cashier_name).filter(Boolean))].sort()
  const grandDebt = allOrders.reduce((s, o) => s + (o.is_paid ? 0 : o.total), 0)

  const unflag = async (order) => {
    if (!confirm(`#${order.order_number.split('-').pop()} захиалгыг анхааруулгын жагсаалтаас хасах уу?`)) return
    try {
      await ordersApi.unflag(order.id)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      setAllOrders(prev => prev.filter(o => o.id !== order.id))
      toast.success('Жагсаалтаас хасагдлаа')
    } catch {}
  }

  const payOrder = async (orderId, method, details) => {
    try {
      await ordersApi.pay(orderId, { payment_method: method, payment_details: details })
      toast.success('Төлбөр амжилттай авлаа')
      refresh()
    } catch {}
  }

  // ── Харилцагчаар бүлэглэх ──────────────────────────────
  const q = search.trim().toLowerCase()
  const filtered = !q ? orders : orders.filter(o => {
    const name  = (o.customer?.name || '').toLowerCase()
    const phone = o.customer?.phone || o.phone || ''
    return name.includes(q) || phone.includes(q) || o.order_number.toLowerCase().includes(q)
  })

  const groups = []
  const byKey  = {}
  filtered.forEach(o => {
    const key = o.customer_id ? `c${o.customer_id}` : `p${o.phone || o.id}`
    if (!byKey[key]) {
      byKey[key] = {
        key,
        name:   o.customer?.name || 'Харилцагчгүй',
        phone:  o.customer?.phone || o.phone || null,
        orders: [],
      }
      groups.push(byKey[key])
    }
    byKey[key].orders.push(o)
  })
  groups.forEach(g => {
    g.debt = g.orders.reduce((s, o) => s + (o.is_paid ? 0 : o.total), 0)
  })
  groups.sort((a, b) => b.debt - a.debt)

  const totalDebt = orders.reduce((s, o) => s + (o.is_paid ? 0 : o.total), 0)
  const customerCount = new Set(
    orders.map(o => (o.customer_id ? `c${o.customer_id}` : `p${o.phone || o.id}`))
  ).size

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b px-5 py-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Анхааруулгатай захиалга
          </h1>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700
                       bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Шинэчлэх
          </button>
        </div>

        {/* Огнооны хурдан шүүлтүүр */}
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_FILTERS.map((f, i) => (
            <button
              key={i}
              onClick={() => applyQuick(i)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all
                ${activeQuick === i
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Огнооны хязгаар */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setActiveQuick(null) }}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50"
          />
          <span className="text-gray-400 text-sm shrink-0">—</span>
          <input
            type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setActiveQuick(null) }}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50"
          />
          <button
            onClick={applyCustom}
            className="shrink-0 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm
                       font-medium hover:bg-amber-600 transition-colors flex items-center gap-1"
          >
            <Search className="w-3.5 h-3.5" />
            Хайх
          </button>
        </div>

        {/* Касс + хайлт */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <UserCog className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={cashier}
              onChange={e => changeCashier(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Бүх касс</option>
              {cashierOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Нэр, утас, захиалгын дугаараар хайх..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {!loading && (orders.length > 0 || grandDebt > 0) && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 shrink-0">
          <div className="flex items-center gap-5 flex-wrap">
            <Stat label="Захиалга"    value={`${orders.length} ш`} />
            <div className="w-px h-7 bg-white/25" />
            <Stat label="Харилцагч"   value={`${customerCount}`} />
            <div className="w-px h-7 bg-white/25" />
            <Stat label="Төлөгдөөгүй (шүүлтээр)" value={`${totalDebt.toLocaleString()}₮`} big />
            {grandDebt !== totalDebt && (
              <>
                <div className="w-px h-7 bg-white/25" />
                <Stat label="Нийт өр (бүх хугацаа)" value={`${grandDebt.toLocaleString()}₮`} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Уншиж байна...</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-3">
            <ShieldCheck className="w-14 h-14 opacity-20" />
            <p className="text-base font-medium text-gray-500">
              {orders.length === 0 ? 'Сонгосон шүүлтэд анхааруулга байхгүй' : 'Хайлтад тохирох илэрц олдсонгүй'}
            </p>
            {orders.length === 0 && (
              grandDebt > 0 ? (
                <button
                  onClick={() => applyQuick(QUICK_FILTERS.length - 1)}
                  className="text-xs text-amber-600 hover:text-amber-700 bg-amber-50 border
                             border-amber-200 px-3 py-1.5 rounded-lg font-medium"
                >
                  Бүх хугацааг харах — {grandDebt.toLocaleString()}₮ өр байна
                </button>
              ) : (
                <p className="text-xs text-center text-gray-400">
                  Дараалал дээр төлбөр төлөлгүй явсан захиалгыг энд нэмнэ
                </p>
              )
            )}
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {groups.map(g => (
              <CustomerGroup
                key={g.key}
                group={g}
                isAdmin={isAdmin}
                onUnflag={unflag}
                onPay={payOrder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


/* ── Summary stat ────────────────────────────────────────── */
function Stat({ label, value, big }) {
  return (
    <div>
      <p className="text-amber-100 text-xs leading-none mb-0.5">{label}</p>
      <p className={`font-bold leading-none text-white ${big ? 'text-base' : 'text-sm'}`}>{value}</p>
    </div>
  )
}


/* ── Харилцагчийн бүлэг ──────────────────────────────────── */
function CustomerGroup({ group, isAdmin, onUnflag, onPay }) {
  return (
    <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
      {/* Customer header */}
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center
                        text-white font-bold shrink-0">
          {group.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-red-800 truncate flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 shrink-0" />
            {group.name}
          </p>
          {group.phone && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {group.phone}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-red-400 leading-none mb-0.5">
            {group.orders.length} захиалга
          </p>
          <p className="font-black text-red-600 text-sm leading-none">
            {group.debt.toLocaleString()}₮
          </p>
        </div>
      </div>

      {/* Orders */}
      <div className="divide-y divide-gray-100">
        {group.orders.map(o => (
          <FlaggedOrderRow
            key={o.id}
            order={o}
            isAdmin={isAdmin}
            onUnflag={onUnflag}
            onPay={onPay}
          />
        ))}
      </div>
    </div>
  )
}


/* ── Нэг захиалгын мөр ───────────────────────────────────── */
function FlaggedOrderRow({ order, isAdmin, onUnflag, onPay }) {
  const [expanded, setExpanded]   = useState(false)
  const [showPay,  setShowPay]    = useState(false)
  const seq = order.order_number.split('-').pop()

  return (
    <div>
      <button onClick={() => setExpanded(v => !v)}
              className="w-full px-4 py-2.5 text-left hover:bg-gray-50/70 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black text-red-600 text-sm shrink-0">#{seq}</span>
            <span className="text-xs text-gray-400 shrink-0">
              {dayjs(order.created_at).format('MM/DD HH:mm')}
            </span>
            {order.is_paid ? (
              <span className="shrink-0 text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                Төлөгдсөн
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                Төлөгдөөгүй
              </span>
            )}
            <span className="shrink-0 text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-gray-800 text-sm">{order.total.toLocaleString()}₮</span>
            <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 flex-wrap">
          {order.flagged_at && (
            <span className="text-amber-600 font-medium">
              ⚠️ {dayjs(order.flagged_at).format('YYYY/MM/DD HH:mm')}
            </span>
          )}
          <span>👷 Касс: {order.cashier_name}</span>
          {order.flagged_by && order.flagged_by !== order.cashier_name && (
            <span>✍️ Тэмдэглэсэн: {order.flagged_by}</span>
          )}
          <span>{order.items.length} зүйл</span>
        </div>

        {order.flagged_reason && (
          <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200
                        rounded-lg px-2 py-1 truncate">
            📝 {order.flagged_reason}
          </p>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 bg-gray-50/60 border-t border-gray-100">
          {/* Items */}
          <div className="py-2 space-y-1">
            {order.items.map((item, i) => {
              const isProduct = item.item_type === 'product'
              const name = item.item_name || item.service?.name || item.product?.name || '—'
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {isProduct
                    ? <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                    : <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
                  <span className="flex-1 text-gray-700 truncate">{name}</span>
                  <span className="text-gray-400">×{item.quantity}</span>
                  <span className="w-20 text-right font-semibold text-gray-700">
                    {item.total_price.toLocaleString()}₮
                  </span>
                </div>
              )
            })}
          </div>

          {order.notes && (
            <p className="text-[11px] text-gray-500 bg-white border border-gray-200 rounded-lg px-2 py-1 mb-2">
              📝 {order.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {!order.is_paid && (
              <button
                onClick={() => setShowPay(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white
                           text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Banknote className="w-3.5 h-3.5" />
                Төлбөр авах — {order.total.toLocaleString()}₮
              </button>
            )}
            {order.is_paid && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Төлбөр барагдсан
              </span>
            )}
            {isAdmin ? (
              <button
                onClick={() => onUnflag(order)}
                className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800
                           bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Жагсаалтаас хасах
              </button>
            ) : (
              <span className="ml-auto text-[11px] text-gray-400 italic">
                Хасах эрх зөвхөн админд
              </span>
            )}
          </div>
        </div>
      )}

      {showPay && (
        <PayModal
          order={order}
          onClose={() => setShowPay(false)}
          onPay={(method, details) => { onPay(order.id, method, details); setShowPay(false) }}
        />
      )}
    </div>
  )
}
