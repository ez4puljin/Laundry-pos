import { useState, useEffect } from 'react'
import {
  ClipboardList, Calendar, ChevronDown, ChevronUp,
  Banknote, Smartphone, ArrowLeftRight, Gift, Layers,
  Package, User, RefreshCw, Search, Trash2, MessageSquare, Save, AlertTriangle, HandCoins
} from 'lucide-react'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { ordersApi, machinesApi } from '../api/client'
import useAuthStore from '../store/useAuthStore'

// Кассчин зөвхөн эхний 2 шүүлтүүрийг (өнөөдөр / өчигдөр) ашиглана — backend дээр мөн хязгаарлагдсан
const QUICK_FILTERS = [
  { label: 'Өнөөдөр', cashier: true, getRange: () => ({ from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { label: 'Өчигдөр', cashier: true, getRange: () => ({ from: dayjs().subtract(1,'day').format('YYYY-MM-DD'), to: dayjs().subtract(1,'day').format('YYYY-MM-DD') }) },
  { label: '7 хоног',  getRange: () => ({ from: dayjs().subtract(6,'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { label: 'Энэ сар',  getRange: () => ({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
]

// Захиалгын төрлөөр шүүх — угаалга / шүршүүр / бүгд
const KIND_FILTERS = [
  { value: '',        label: 'Бүгд' },
  { value: 'laundry', label: 'Угаалга' },
  { value: 'shower',  label: 'Шүршүүр' },
]

const PAYMENT_INFO = {
  cash:     { label: 'Бэлэн',     color: 'bg-emerald-100 text-emerald-700', icon: Banknote       },
  transfer: { label: 'Шилжүүлэг', color: 'bg-blue-100 text-blue-700',       icon: ArrowLeftRight },
  card:     { label: 'Карт',      color: 'bg-violet-100 text-violet-700',    icon: Smartphone     },
  points:   { label: 'Оноо',      color: 'bg-amber-100 text-amber-700',      icon: Gift           },
  mixed:    { label: 'Холимог',   color: 'bg-indigo-100 text-indigo-700',    icon: Layers         },
  unpaid:   { label: 'Төлбөр төлөөгүй', color: 'bg-red-100 text-red-700',    icon: AlertTriangle  },
}

// Төлсөн төлбөрийн хэлбэрээр шүүх
// Нэг удаад татах захиалгын тоо (backend-ийн HISTORY_PAGE_SIZE-тай тэнцүү)
const PAGE = 100

const PAY_FILTERS = [
  { value: '',         label: 'Бүх төлбөр' },
  { value: 'cash',     label: 'Бэлэн'      },
  { value: 'transfer', label: 'Шилжүүлэг'  },
  { value: 'card',     label: 'Карт'       },
  { value: 'mixed',    label: 'Холимог'    },
  { value: 'unpaid',   label: 'Төлөгдөөгүй' },
]

export default function HistoryPage() {
  const isAdmin = useAuthStore(s => s.isAdmin)()
  const today = dayjs().format('YYYY-MM-DD')

  // Кассчинд зөвхөн өнөөдөр / өчигдрийн захиалга харагдана
  const quickFilters = isAdmin ? QUICK_FILTERS : QUICK_FILTERS.filter(f => f.cashier)

  const [dateFrom,    setDateFrom]    = useState(today)
  const [dateTo,      setDateTo]      = useState(today)
  const [orders,      setOrders]      = useState([])
  const [lateOrders,  setLateOrders]  = useState([])  // нөхөж авсан төлбөр
  const [loading,     setLoading]     = useState(false)
  const [activeQuick, setActiveQuick] = useState(0)
  const [kind,        setKind]        = useState('')  // '' | 'laundry' | 'shower'
  const [payMethod,   setPayMethod]   = useState('')  // '' = бүх төлбөр
  // Хуудаслалт — жилийн түүх татахад хөтөч гацахгүй байхын тулд
  const [summary,   setSummary]   = useState(null)   // серверээс бодсон нийлбэр
  const [hasMore,   setHasMore]   = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedId,  setExpandedId]  = useState(null)
  const [usagesMap,   setUsagesMap]   = useState({})  // orderId → usages[]

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!usagesMap[id]) {
      try {
        const r = await machinesApi.usagesByOrder(id)
        setUsagesMap(prev => ({ ...prev, [id]: r.data || [] }))
      } catch { setUsagesMap(prev => ({ ...prev, [id]: [] })) }
    }
  }

  const fetchOrders = async (from, to, k = kind, pm = payMethod) => {
    setLoading(true)
    try {
      const base = {
        date_from: from, date_to: to,
        ...(k  ? { kind: k }            : {}),
        ...(pm ? { payment_method: pm } : {}),
      }
      const [active, late, deleted, sum] = await Promise.all([
        // Эхний хуудас — цааш нь «Цааш үзэх» товчоор нэмнэ
        ordersApi.list({ ...base, limit: PAGE }),
        // Өмнөх өдрийн захиалгын төлбөрийг энэ хугацаанд нөхөж авсан
        ordersApi.latePayments({ date_from: from, date_to: to }),
        isAdmin ? ordersApi.list({ ...base, status: 'deleted', limit: PAGE })
                : Promise.resolve(null),
        // Нийт дүнг СЕРВЕР бүтэн хугацаанд нь бодно
        ordersApi.summary(base),
      ])

      const byId = new Map()
      for (const r of [active, deleted]) {
        for (const o of (r?.data || [])) byId.set(o.id, o)
      }

      const list = [...byId.values()].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )
      setOrders(list)
      setLateOrders(late.data || [])
      setSummary(sum?.data || null)
      // Идэвхтэй захиалга бүтэн хуудас ирсэн бол цааш байж магадгүй
      setHasMore((active?.data || []).length >= PAGE)
    } finally {
      setLoading(false)
    }
  }

  /** «Цааш үзэх» — дараагийн хуудсыг нэмж татна. */
  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const skip = orders.filter(o => o.status !== 'deleted').length
      const { data } = await ordersApi.list({
        date_from: dateFrom, date_to: dateTo,
        ...(kind ? { kind } : {}),
        ...(payMethod ? { payment_method: payMethod } : {}),
        skip, limit: PAGE,
      })
      const rows = data || []
      setOrders(prev => {
        const byId = new Map(prev.map(o => [o.id, o]))
        for (const o of rows) byId.set(o.id, o)
        return [...byId.values()].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at))
      })
      setHasMore(rows.length >= PAGE)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { fetchOrders(today, today) }, [])

  const applyQuick = (idx) => {
    const { from, to } = quickFilters[idx].getRange()
    setDateFrom(from); setDateTo(to); setActiveQuick(idx)
    fetchOrders(from, to)
  }

  const applyCustom = () => {
    setActiveQuick(null)
    fetchOrders(dateFrom, dateTo)
  }

  const applyKind = (k) => {
    setKind(k)
    fetchOrders(dateFrom, dateTo, k)
  }

  const applyPay = (pm) => {
    setPayMethod(pm)
    fetchOrders(dateFrom, dateTo, kind, pm)
  }

  const activeOrders  = orders.filter(o => o.status !== 'deleted')
  const deletedOrders = orders.filter(o => o.status === 'deleted')

  // Бүх нийлбэрийг СЕРВЕР бүтэн хугацаанд нь бодно. Хуудаслаж татсан
  // жагсаалтаас бодвол зөвхөн эхний 100 захиалгын дүн гарах байсан.
  const s = summary
  const shownCount    = activeOrders.length
  const activeCount   = s ? s.active_count   : shownCount
  const totalRevenue  = s ? s.active_total   : 0
  const totalDiscount = s ? s.discount_total : 0
  const deletedCount  = s ? s.deleted_count  : deletedOrders.length
  const deletedTotal  = s ? s.deleted_total  : 0
  const unpaidTotal   = s ? s.unpaid_total   : 0
  const lateTotal     = s ? s.late_total     : 0
  // Бодит орлого = тухайн хугацааны төлөгдсөн + нөхөж авсан төлбөр
  const netRevenue    = totalRevenue - unpaidTotal + lateTotal

  const breakdown = Object.entries(s?.breakdown || {}).filter(([, v]) => v > 0)

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b px-5 py-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-800">📋 Захиалгын түүх</h1>
          <button
            onClick={() => fetchOrders(dateFrom, dateTo)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700
                       bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Шинэчлэх
          </button>
        </div>

        {/* Төрлөөр шүүх — угаалга / шүршүүр / бүгд */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {KIND_FILTERS.map(k => (
            <button
              key={k.value}
              onClick={() => applyKind(k.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border
                ${kind === k.value
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {k.label}
            </button>
          ))}

          <span className="w-px h-5 bg-gray-200 mx-1" />

          {/* Төлсөн төлбөрийн хэлбэрээр шүүх */}
          {PAY_FILTERS.map(p => (
            <button
              key={p.value}
              onClick={() => applyPay(p.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                ${payMethod === p.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Quick filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {quickFilters.map((f, i) => (
            <button
              key={i}
              onClick={() => applyQuick(i)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all
                ${activeQuick === i
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date range — зөвхөн админд. Кассчин өнөөдөр/өчигдрөөс цааш харахгүй */}
        {isAdmin ? (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActiveQuick(null) }}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            />
            <span className="text-gray-400 text-sm shrink-0">—</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActiveQuick(null) }}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            />
            <button
              onClick={applyCustom}
              className="shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm
                         font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              Хайх
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            Кассчин зөвхөн өнөөдөр болон өчигдрийн захиалгыг харна
          </p>
        )}
      </div>

      {/* ── Summary bar ── */}
      {!loading && orders.length > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 shrink-0">
          <div className="flex items-center gap-5 flex-wrap">
            <Stat label="Захиалга" value={`${activeCount} ш`} white />
            <div className="w-px h-7 bg-white/20" />
            <Stat label="Нийт" value={`${totalRevenue.toLocaleString()}₮`} white />
            {unpaidTotal > 0 && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <Stat label="Төлбөр төлөөгүй" value={`${unpaidTotal.toLocaleString()}₮`} red />
              </>
            )}
            {lateTotal > 0 && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <Stat label={`Нөхөж авсан (${lateOrders.length})`} value={`+${lateTotal.toLocaleString()}₮`} orange />
              </>
            )}
            {(unpaidTotal > 0 || lateTotal > 0) && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <Stat label="Нийт орлого" value={`${netRevenue.toLocaleString()}₮`} green />
              </>
            )}
            {deletedCount > 0 && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <Stat label={`Устгагдсан (${deletedCount})`} value={`${deletedTotal.toLocaleString()}₮`} red />
              </>
            )}
            {totalDiscount > 0 && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <Stat label="Хямдрал" value={`-${totalDiscount.toLocaleString()}₮`} green />
              </>
            )}
            {breakdown.length > 0 && (
              <>
                <div className="w-px h-7 bg-white/20" />
                <div className="flex items-center gap-2 flex-wrap">
                  {breakdown.map(([method, amount]) => {
                    const info = PAYMENT_INFO[method] || { label: method, icon: Banknote }
                    const Icon = info.icon
                    return (
                      <div key={method}
                           className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1">
                        <Icon className="w-3 h-3 text-white/70" />
                        <span className="text-xs text-blue-100">{info.label}</span>
                        <span className="text-xs font-bold text-white">{amount.toLocaleString()}₮</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Order list ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Уншиж байна...</span>
          </div>
        ) : orders.length === 0 && lateOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-3">
            <ClipboardList className="w-14 h-14 opacity-20" />
            <p className="text-base font-medium text-gray-500">Захиалга олдсонгүй</p>
            <p className="text-xs text-center text-gray-400">
              Сонгосон хугацаанд олгосон захиалга байхгүй байна
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-5xl mx-auto">
            {/* ── Нөхөж авсан төлбөр (өмнөх өдрийн захиалга) ── */}
            {lateOrders.length > 0 && (
              <div className="rounded-xl border border-orange-300 bg-orange-50/60 overflow-hidden mb-3">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-orange-100 border-b border-orange-200">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-orange-800">
                    <HandCoins className="w-4 h-4" />
                    Нөхөж авсан төлбөр ({lateOrders.length})
                  </span>
                  <span className="text-sm font-black text-orange-700">
                    +{lateTotal.toLocaleString()}₮
                  </span>
                </div>
                <p className="px-3 py-1.5 text-[11px] text-orange-700/80 border-b border-orange-200">
                  Өмнөх өдрийн захиалгын төлбөр. Захиалгын тоонд ороогүй ч нийт орлогод нэмэгдсэн.
                </p>
                <div className="divide-y divide-orange-100">
                  {lateOrders.map(o => <LatePaymentRow key={o.id} order={o} />)}
                </div>
              </div>
            )}

            {orders.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() => toggleExpand(order.id)}
                usages={usagesMap[order.id] || []}
                isAdmin={isAdmin}
                onDelete={async (id) => {
                  if (!confirm('Энэ захиалгыг устгах уу?')) return
                  try {
                    await ordersApi.remove(id)
                    setOrders(prev => prev.filter(o => o.id !== id))
                    toast.success('Захиалга устгагдлаа')
                  } catch { /* handled by interceptor */ }
                }}
              />
            ))}

            {/* ── Хуудаслалт ── */}
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full mt-2 py-3 rounded-xl border border-gray-200 bg-white
                           text-sm font-semibold text-gray-600 hover:bg-gray-50
                           disabled:opacity-60 transition-colors"
              >
                {loadingMore
                  ? 'Уншиж байна…'
                  : `Цааш үзэх — ${shownCount}/${activeCount}`}
              </button>
            ) : activeCount > PAGE && (
              <p className="text-center text-xs text-gray-400 py-3">
                Бүх {activeCount} захиалга харагдлаа
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Stat helper ──────────────────────────────────────────
function Stat({ label, value, white, green, red, orange }) {
  return (
    <div>
      <p className="text-blue-200 text-xs leading-none mb-0.5">{label}</p>
      <p className={`font-bold text-sm leading-none
        ${red ? 'text-red-300' : orange ? 'text-orange-300' : green ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}


// ── Нөхөж авсан төлбөрийн мөр ────────────────────────────
function LatePaymentRow({ order }) {
  const seq  = order.order_number.split('-').pop()
  const info = PAYMENT_INFO[order.payment_method] || { label: order.payment_method, icon: Banknote }
  const Icon = info.icon

  return (
    <div className="px-3 py-2 bg-white/70">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-orange-600 text-sm shrink-0">#{seq}</span>
          <span className="text-[11px] text-gray-400 shrink-0">
            захиалга: {dayjs(order.created_at).format('MM/DD')}
          </span>
          <span className="text-xs text-gray-600 truncate">
            {order.customer
              ? <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400 inline" />{order.customer.name}</span>
              : <span className="text-gray-400 italic">Харилцагчгүй</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5
                           rounded-full bg-orange-100 text-orange-700">
            <Icon className="w-3 h-3" />
            {info.label}
          </span>
          <span className="font-black text-orange-700 text-sm">+{order.total.toLocaleString()}₮</span>
        </div>
      </div>
      <p className="text-[11px] text-orange-600/80 mt-0.5">
        💰 Төлбөр авсан: {order.paid_at ? dayjs(order.paid_at).format('MM/DD HH:mm') : '—'}
        {order.paid_by && ` · ${order.paid_by}`}
      </p>
    </div>
  )
}


// ── Order row ────────────────────────────────────────────
function OrderRow({ order, expanded, onToggle, usages, isAdmin, onDelete, onUpdateOrder }) {
  const [noteText, setNoteText] = useState(order.notes || '')
  const [editingNote, setEditingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  const saveNote = async () => {
    setSavingNote(true)
    try {
      await ordersApi.updateNotes(order.id, noteText)
      order.notes = noteText
      setEditingNote(false)
      toast.success('Тайлбар хадгалагдлаа')
      onUpdateOrder?.()
    } catch {} finally { setSavingNote(false) }
  }

  const parts   = order.order_number.split('-')
  const seq     = parts[parts.length - 1]
  const prefix  = parts.slice(0, -1).join('-')
  const info    = !order.is_paid
    ? PAYMENT_INFO.unpaid
    : (PAYMENT_INFO[order.payment_method] || { label: order.payment_method, color: 'bg-gray-100 text-gray-600', icon: Banknote })
  const PayIcon = info.icon

  // Items preview — first 2 names
  const itemNames = order.items.map(it =>
    it.item_name || it.service?.name || it.product?.name || '—'
  )
  const preview = itemNames.slice(0, 2).join(', ') + (itemNames.length > 2 ? ` +${itemNames.length - 2}` : '')

  // Шүршүүрийн захиалгын оочирын дугаарууд (хүн тус бүрд нэг)
  const queueNos = (order.sessions || [])
    .slice()
    .sort((a, b) => a.queue_no - b.queue_no)

  const isDeleted = order.status === 'deleted'
  const isFlagged = order.is_flagged && !isDeleted

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden transition-all
      ${isDeleted ? 'bg-red-50/50 border-red-200 opacity-75' :
        isFlagged ? 'bg-white border-amber-300 ring-1 ring-amber-100' :
        expanded ? 'bg-white border-blue-200 shadow-md' : 'bg-white border-gray-200 hover:border-blue-100 hover:shadow'}`}>

      {/* Анхааруулга banner */}
      {isFlagged && (
        <div className="bg-amber-100 px-3 py-1.5 flex items-center gap-2 text-xs text-amber-800
                        font-semibold border-b border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{order.is_paid ? 'Анхааруулга — төлбөр барагдсан' : 'Анхааруулга — төлбөр төлөөгүй'}</span>
          {order.flagged_at && (
            <span className="ml-auto font-mono text-amber-600">
              {dayjs(order.flagged_at).format('MM/DD HH:mm')}
            </span>
          )}
        </div>
      )}

      {/* Deleted banner */}
      {isDeleted && (
        <div className="bg-red-100 px-3 py-1.5 flex items-center gap-2 text-xs text-red-700 font-semibold border-b border-red-200">
          <Trash2 className="w-3.5 h-3.5" />
          <span>Устгагдсан</span>
          {order.deleted_at && (
            <span className="ml-auto font-mono text-red-500">
              {dayjs(order.deleted_at).format('YYYY/MM/DD HH:mm')}
            </span>
          )}
        </div>
      )}

      {/* ── Collapsed row ── */}
      <button onClick={onToggle}
              className="w-full px-3 py-2.5 text-left hover:bg-gray-50/70 transition-colors">

        {/* Row 1: order# + total + chevron */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0">
              <p className="text-[10px] text-gray-400 leading-none">{prefix}</p>
              <p className="font-black text-blue-600 text-sm leading-tight">#{seq}</p>
            </div>
            <div className="w-px h-6 bg-gray-200 shrink-0" />
            <div className="shrink-0 text-xs text-gray-500">
              <p className="leading-none">{dayjs(order.created_at).format('MM/DD')}</p>
              <p className="font-semibold leading-tight">{dayjs(order.created_at).format('HH:mm')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-right">
              <p className="font-black text-gray-800 text-sm leading-tight">
                {order.total.toLocaleString()}₮
              </p>
              <p className="text-[10px] text-gray-400 leading-none">{order.items.length} зүйл</p>
            </div>
            <div className={`text-gray-300 transition-transform duration-200
              ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Row 2: customer + payment badge */}
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-xs truncate text-gray-600">
            {order.customer
              ? <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400 shrink-0 inline" />
                  {order.customer.name}
                </span>
              : <span className="text-gray-400 italic">Харилцагчгүй</span>
            }
          </p>
          <span className={`shrink-0 flex items-center gap-1 text-xs font-semibold
                            px-2 py-0.5 rounded-full ${info.color}`}>
            <PayIcon className="w-3 h-3" />
            {info.label}
          </span>
        </div>

        {/* Оочирын дугаарууд — зөвхөн шүршүүрийн захиалгад */}
        {queueNos.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            <span className="text-[10px] text-gray-400 mr-0.5">Оочир:</span>
            {queueNos.map(s => (
              <span
                key={s.id}
                title={s.type_name || ''}
                className="text-[11px] font-black tabular-nums text-amber-700
                           bg-amber-50 border border-amber-200 px-1.5 rounded"
              >
                №{String(s.queue_no).padStart(3, '0')}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: items preview + note indicator */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {preview && (
            <p className="text-[11px] text-gray-400 truncate flex-1">{preview}</p>
          )}
          {order.notes && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              <MessageSquare className="w-3 h-3" />
              тайлбар
            </span>
          )}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60">

          {/* Meta info row */}
          <div className="px-4 py-2 flex items-center gap-4 text-xs text-gray-500 border-b border-gray-100 flex-wrap">
            <span>📅 {dayjs(order.created_at).format('YYYY/MM/DD HH:mm')}</span>
            <span>👷 {order.cashier_name}</span>
            {order.customer?.phone && <span>📱 {order.customer.phone}</span>}
            {order.notes && <span className="text-blue-600">📝 {order.notes}</span>}
          </div>

          {/* Items table */}
          <div className="px-4 pt-3 pb-1">
            <div className="rounded-xl overflow-hidden border border-gray-200">
              {/* Table header */}
              <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-100 text-xs text-gray-500 font-semibold">
                <span className="flex-1">Нэр</span>
                <span className="w-8 text-center">Тоо</span>
                <span className="w-24 text-right">Нэгж үнэ</span>
                <span className="w-24 text-right">Нийт</span>
                <span className="w-28 text-right">Эхэлсэн</span>
              </div>
              {order.items.map((item, i) => {
                const isProduct = item.item_type === 'product'
                const name = item.item_name || item.service?.name || item.product?.name || '—'
                const usage = usages.find(u => u.order_item_id === item.id)
                // Шүршүүрийн мөр — тухайн мөрөөс үүссэн тасалбаруудын оочир
                const lineQueue = queueNos.filter(s => s.order_item_id === item.id)
                return (
                  <div key={i}
                       className={`flex items-center gap-3 px-3 py-2 text-sm
                         ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}
                         ${i < order.items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                      {isProduct
                        ? <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      }
                      <span className="text-gray-700 font-medium truncate">{name}</span>
                      {lineQueue.map(s => (
                        <span key={s.id}
                              className="text-[10px] font-black tabular-nums text-amber-700
                                         bg-amber-50 border border-amber-200 px-1 rounded shrink-0">
                          №{String(s.queue_no).padStart(3, '0')}
                        </span>
                      ))}
                      {item.notes && (
                        <span className="text-xs text-gray-400 italic truncate">({item.notes})</span>
                      )}
                    </span>
                    <span className="w-8 text-center text-gray-500 text-xs">×{item.quantity}</span>
                    <span className="w-24 text-right text-gray-400 text-xs">
                      {item.unit_price.toLocaleString()}₮
                    </span>
                    <span className="w-24 text-right font-semibold text-gray-800">
                      {item.total_price.toLocaleString()}₮
                    </span>
                    <span className="w-28 text-right text-xs text-gray-400">
                      {usage ? dayjs(usage.started_at).format('HH:mm') : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="px-4 pb-3 pt-2 flex justify-end">
            <div className="w-60 space-y-1">
              <TotalRow label="Дэд дүн" value={`${order.subtotal.toLocaleString()}₮`} />
              {order.discount_amount > 0 && (
                <TotalRow
                  label={`Хямдрал${order.discount_type === 'percent' ? ` (${order.discount_value}%)` : ''}`}
                  value={`-${order.discount_amount.toLocaleString()}₮`}
                  green
                />
              )}
              {order.points_used > 0 && (
                <TotalRow
                  label={`Оноо (${order.points_used} оноо)`}
                  value={`-${order.points_used.toLocaleString()}₮`}
                  amber
                />
              )}
              <div className="border-t border-gray-200 pt-1.5">
                <TotalRow label="Төлсөн дүн" value={`${order.total.toLocaleString()}₮`} bold />
              </div>

              {/* Mixed payment breakdown */}
              {order.payment_method === 'mixed' && order.payment_details && (() => {
                try {
                  return Object.entries(JSON.parse(order.payment_details))
                    .filter(([, v]) => Number(v) > 0)
                    .map(([method, amount]) => {
                      const pi = PAYMENT_INFO[method] || { label: method, icon: Banknote }
                      const Icon = pi.icon
                      return (
                        <div key={method} className="flex justify-between text-xs text-gray-400 pl-2">
                          <span className="flex items-center gap-1">
                            <Icon className="w-3 h-3" /> {pi.label}
                          </span>
                          <span>{Number(amount).toLocaleString()}₮</span>
                        </div>
                      )
                    })
                } catch { return null }
              })()}

              {order.points_earned > 0 && (
                <div className="flex justify-between text-xs text-amber-600 pt-0.5">
                  <span>⭐ Цуглуулсан оноо</span>
                  <span className="font-semibold">+{order.points_earned}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes section */}
          <div className="px-4 pb-3">
            {editingNote ? (
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Тайлбар бичих... (жишээ: цамц, гутал орхисон)"
                  className="flex-1 border border-amber-200 rounded-lg px-3 py-2 text-xs
                             focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/50 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={saveNote} disabled={savingNote}
                    className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                    <Save className="w-3 h-3" /> Хадгалах
                  </button>
                  <button onClick={() => { setEditingNote(false); setNoteText(order.notes || '') }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1">
                    Болих
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNote(true)}
                className={`w-full text-left flex items-start gap-2 rounded-lg px-3 py-2 text-xs transition-colors
                  ${order.notes ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-gray-50 hover:bg-gray-100 text-gray-400 border border-dashed border-gray-200'}`}>
                <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="flex-1">{order.notes || 'Тайлбар нэмэх...'}</span>
              </button>
            )}
          </div>

          {/* Admin delete button */}
          {isAdmin && !isDeleted && (
            <div className="px-4 pb-3 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(order.id) }}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700
                           bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Захиалга устгах
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Row helpers ──────────────────────────────────────────
function TotalRow({ label, value, bold, green, amber }) {
  return (
    <div className={`flex justify-between text-sm
      ${bold ? 'font-bold text-gray-800' : green ? 'text-emerald-600' : amber ? 'text-amber-600' : 'text-gray-500'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
