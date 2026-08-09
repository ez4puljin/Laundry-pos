import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Clock, ChevronRight, CheckCircle2, Package, Loader2, Play, Archive, CircleCheck, Banknote, X, Plus, Search, Wrench, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import { ordersApi, machinesApi, servicesApi, inventoryApi } from '../api/client'
import MachinePanel from '../components/MachinePanel'
import PayModal from '../components/PayModal'

/* ── Status configuration ───────────────────────────────── */
const STATUSES = [
  {
    key:   'pending',
    label: 'Хүлээгдэж байна',
    icon:  '🕐',
    bg:    'bg-amber-50',
    border:'border-amber-200',
    header:'bg-amber-100 border-amber-300 text-amber-800',
    dot:   'bg-amber-400',
    btn:   'bg-amber-500 hover:bg-amber-600',
  },
  {
    key:   'processing',
    label: 'Үйлчилгээ хийгдэж байна',
    icon:  '⚙️',
    bg:    'bg-blue-50',
    border:'border-blue-200',
    header:'bg-blue-100 border-blue-300 text-blue-800',
    dot:   'bg-blue-500',
    btn:   'bg-blue-500 hover:bg-blue-600',
  },
  {
    key:   'ready',
    label: 'Бэлэн болсон',
    icon:  '✅',
    bg:    'bg-green-50',
    border:'border-green-200',
    header:'bg-green-100 border-green-300 text-green-800',
    dot:   'bg-green-500',
    btn:   'bg-green-500 hover:bg-green-600',
  },
  {
    key:   'delivered',
    label: 'Олгосон',
    icon:  '📦',
    bg:    'bg-gray-50',
    border:'border-gray-200',
    header:'bg-gray-100 border-gray-300 text-gray-600',
    dot:   'bg-gray-400',
    btn:   'bg-gray-500 hover:bg-gray-600',
  },
]

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]))

/* ── Main QueuePage ─────────────────────────────────────── */
export default function QueuePage() {
  const [orders, setOrders]           = useState([])
  const [machines, setMachines]       = useState([])
  const [usages, setUsages]           = useState([])  // all active usages (running + completed)
  // categoryMap removed — now using service.machine_ids for filtering
  const [loading, setLoading]         = useState(true)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ordersApi.queue()
      setOrders(res.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMachines = useCallback(async () => {
    try {
      const [mRes, uRes] = await Promise.all([
        machinesApi.list(),
        machinesApi.activeUsages(),
      ])
      setMachines(mRes.data || [])
      setUsages(uRes.data || [])
    } catch {}
  }, [])

  // fetchCategories removed — machine filtering now uses service.machine_ids

  useEffect(() => {
    fetchQueue()
    fetchMachines()
    const q = setInterval(fetchQueue, 30000)
    const m = setInterval(fetchMachines, 10000)
    return () => { clearInterval(q); clearInterval(m) }
  }, [fetchQueue, fetchMachines])

  const updateStatus = async (orderId, status) => {
    try {
      await ordersApi.updateStatus(orderId, status)
      const label = STATUS_MAP[status]?.label || status
      toast.success(status === 'delivered' ? '📦 Олгогдлоо' : `→ ${label}`)
      fetchQueue()
      fetchMachines()
    } catch {}
  }

  const refreshAll = () => { fetchQueue(); fetchMachines() }

  const payOrder = async (orderId, paymentMethod, paymentDetails) => {
    try {
      await ordersApi.pay(orderId, { payment_method: paymentMethod, payment_details: paymentDetails })
      toast.success('Төлбөр амжилттай авлаа')
      fetchQueue()
    } catch {}
  }

  const archiveAll = async () => {
    try {
      const res = await ordersApi.archiveDelivered()
      toast.success(`${res.data.archived} захиалга архивлагдлаа`)
      fetchQueue()
    } catch {}
  }

  // Төлбөр төлөлгүй явсан захиалгыг анхааруулгын жагсаалтад оруулах
  const flagOrder = async (orderId, reason) => {
    try {
      await ordersApi.flag(orderId, reason)
      toast.success('⚠️ Анхааруулгын жагсаалтад нэмэгдлээ')
      fetchQueue()
    } catch {}
  }

  // Build usageMap: `${order_item_id}_${sub_index}` → { status, machineName, startedAt, durationMin }
  const usageMap = {}
  const _ukey = (itemId, sub) => `${itemId}_${sub ?? 0}`
  usages.forEach(u => {
    if (!u.order_item_id) return
    const key = _ukey(u.order_item_id, u.sub_index)
    if (u.status === 'completed' || !usageMap[key]) {
      usageMap[key] = {
        status: u.status,
        machineName: u.service_name ? u.machine_id : null,
        startedAt: u.started_at,
        durationMin: u.duration_min,
      }
    }
  })
  // Also add machine names from machines list for running usages
  machines.forEach(m => {
    if (m.current_usage?.order_item_id) {
      const key = _ukey(m.current_usage.order_item_id, m.current_usage.sub_index)
      usageMap[key] = {
        status: 'running',
        machineName: m.name,
        machineType: m.machine_type,
        startedAt: m.current_usage.started_at,
        durationMin: m.current_usage.duration_min,
      }
    }
  })
  // Fill in machine names for completed usages
  usages.forEach(u => {
    if (u.status === 'completed' && u.order_item_id) {
      const key = _ukey(u.order_item_id, u.sub_index)
      usageMap[key] = {
        ...usageMap[key],
        status: 'completed',
        machineName: u.service_name,
      }
    }
  })

  // Group orders by status (map washing/ironing to processing)
  const grouped = STATUSES.reduce((acc, s) => { acc[s.key] = []; return acc }, {})
  orders.forEach(o => {
    let st = o.status
    if (st === 'washing' || st === 'ironing') st = 'processing'
    if (grouped[st]) grouped[st].push(o)
  })

  const [showMachines, setShowMachines] = useState(false)
  const busyCount = machines.filter(m => m.current_usage).length

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Header (compact) ── */}
      <div className="bg-white border-b px-4 py-2.5 flex items-center justify-between shrink-0">
        <h1 className="font-bold text-base text-gray-800">📋 Дараалал</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMachines(!showMachines)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${showMachines ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            🔧 {busyCount}/{machines.length}
          </button>
          <button onClick={refreshAll}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Machine Panel (collapsible) ── */}
      {showMachines && (
        <MachinePanel machines={machines} onAssign={refreshAll} onComplete={refreshAll} />
      )}

      {/* ── All stages as columns ── */}
      <div className="flex-1 overflow-x-auto">
        <div className="grid grid-cols-4 gap-3 p-3 h-full min-w-[900px]">
          {STATUSES.map(s => {
            const cards = grouped[s.key] || []
            return (
              <div key={s.key} className="flex flex-col min-h-0">
                {/* Column header */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border ${s.header} shrink-0`}>
                  <span className="text-sm">{s.icon}</span>
                  <span className="text-xs font-semibold">{s.label}</span>
                  {cards.length > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-white/70">
                      {cards.length}
                    </span>
                  )}
                </div>

                {/* Column body */}
                <div className={`flex-1 overflow-y-auto rounded-b-xl border border-t-0 ${s.border} ${s.bg} p-2 space-y-2`}>
                  {/* Archive button for delivered */}
                  {s.key === 'delivered' && cards.length > 0 && (
                    <button onClick={archiveAll}
                      className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200
                                 text-gray-600 text-xs font-semibold py-2 rounded-lg transition-colors">
                      <Archive className="w-3.5 h-3.5" /> Архивлах ({cards.length})
                    </button>
                  )}

                  {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                      <div className="text-3xl mb-2 opacity-30">{s.icon}</div>
                      <p className="text-xs font-medium">Хоосон</p>
                    </div>
                  ) : (
                    cards.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        status={s}
                        onUpdateStatus={updateStatus}
                        usageMap={usageMap}
                        machines={machines}
                        onMachineAction={refreshAll}
                        onPay={payOrder}
                        onFlag={flagOrder}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


/* ── Order card ─────────────────────────────────────────── */
function OrderCard({ order, status, onUpdateStatus, usageMap, machines, onMachineAction, onPay, onFlag }) {
  const [showPayModal, setShowPayModal]   = useState(false)
  const [showAddModal, setShowAddModal]   = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const raw       = order.created_at
  const createdAt = dayjs(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
  const elapsed   = dayjs().diff(createdAt, 'minute')

  const timeLabel = elapsed < 60
    ? `${elapsed}мин`
    : `${Math.floor(elapsed / 60)}ц ${elapsed % 60}мин`

  const isUrgent = elapsed > 60
  const isMedium = elapsed > 30 && !isUrgent

  // Effective status (map washing/ironing to processing)
  const effectiveStatus = (order.status === 'washing' || order.status === 'ironing') ? 'processing' : order.status
  const isProcessing = effectiveStatus === 'processing'
  const isDelivered  = effectiveStatus === 'delivered'

  // Expand items: quantity > 1 үед service тус бүрийг салгаж харуулах
  const _ukey = (itemId, sub) => `${itemId}_${sub ?? 0}`
  const expandedItems = []
  order.items.forEach(item => {
    if (item.item_type === 'service' && item.quantity > 1) {
      for (let si = 0; si < item.quantity; si++) {
        expandedItems.push({ ...item, _subIndex: si, _label: `${item.item_name || item.service?.name || '—'} (${si + 1}/${item.quantity})` })
      }
    } else {
      expandedItems.push({ ...item, _subIndex: 0, _label: item.item_name || item.service?.name || item.product?.name || '—' })
    }
  })

  // Check if all service items have completed machine usage
  const serviceUnits = expandedItems.filter(i => i.item_type === 'service')
  const allServicesDone = serviceUnits.length === 0 || serviceUnits.every(i => usageMap[_ukey(i.id, i._subIndex)]?.status === 'completed')

  // Анхааруулгад орсон захиалга (төлбөргүй явсан) дараалалд үлдэж, төлбөр
  // төлөгдөөгүй байсан ч дараагийн төлөв рүү шилжинэ.
  const canDeliver = order.is_paid || order.is_flagged

  // Determine next status and label
  let nextStatus = null
  let nextLabel  = null
  if (effectiveStatus === 'pending') {
    nextStatus = 'processing'
    nextLabel  = 'Үйлчилгээ эхлэх'
  } else if (isProcessing && allServicesDone) {
    nextStatus = 'ready'
    nextLabel  = 'Бэлэн болгох'
  } else if (effectiveStatus === 'ready') {
    nextStatus = 'delivered'
    nextLabel  = canDeliver
      ? (order.is_paid ? 'Олгох' : 'Олгох (төлбөргүй)')
      : 'Төлбөр төлөгдөөгүй'
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm transition-shadow hover:shadow-md
      ${order.is_flagged ? 'border-amber-400 ring-1 ring-amber-200' :
        isUrgent && !isDelivered ? 'border-red-300 ring-1 ring-red-200' :
        isMedium && !isDelivered ? 'border-amber-200' : status.border}`}>

      {/* Анхааруулгын тэмдэг */}
      {order.is_flagged && (
        <div className="bg-amber-100 px-3 py-1 flex items-center gap-1.5 text-[11px] font-bold
                        text-amber-800 border-b border-amber-200 rounded-t-xl">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{order.is_paid ? 'Анхааруулга — төлбөр барагдсан' : 'Анхааруулга — төлбөргүй явсан'}</span>
        </div>
      )}

      {/* Top: order number + elapsed time */}
      <div className={`flex items-center justify-between px-3 pt-2.5 pb-2 border-b
        ${isUrgent && !isDelivered ? 'border-red-100' : 'border-gray-100'}`}>
        <span className="font-bold text-sm text-gray-800 tracking-wide">
          #{order.order_number.split('-').pop()}
          <span className="text-gray-400 font-normal text-xs ml-1">
            {order.order_number.split('-').slice(0, -1).join('-')}
          </span>
        </span>
        {!isDelivered && (
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
            ${isUrgent ? 'bg-red-100 text-red-600' :
              isMedium ? 'bg-amber-100 text-amber-600' :
                         'bg-gray-100 text-gray-500'}`}>
            <Clock className="w-3 h-3" />
            {timeLabel}
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        {/* Customer */}
        {order.customer ? (
          <p className="text-xs text-gray-600 mb-2 font-medium flex items-center gap-1.5">
            <span>👤 {order.customer.name}</span>
            {order.customer.phone && (
              <span className="font-bold text-yellow-600 text-sm ml-auto">
                {order.customer.phone}
              </span>
            )}
          </p>
        ) : order.phone ? (
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
            <span>📱</span>
            <span className="font-bold text-yellow-600 text-sm">{order.phone}</span>
          </p>
        ) : null}

        {/* Items (expanded: quantity>1 service тус бүр салангид мөр) */}
        <div className="space-y-1.5 mb-2.5">
          {expandedItems.map((item, i) => {
            const isProduct = item.item_type === 'product'
            const name = item._label
            const ukey = _ukey(item.id, item._subIndex)
            const usage = usageMap?.[ukey]

            return (
              <div key={`${item.id}_${item._subIndex}`}>
                <div className="flex items-center gap-2 text-xs">
                  {/* Status indicator */}
                  {usage?.status === 'completed' ? (
                    <CircleCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : usage?.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-spin" />
                  ) : isProduct ? (
                    <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
                  )}
                  <span className={`flex-1 leading-snug ${usage?.status === 'completed' ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                    {name}
                  </span>
                  {isProduct && <span className="text-gray-400 font-medium shrink-0">×{item.quantity}</span>}
                </div>

                {/* Machine badge for running items */}
                {usage?.status === 'running' && (
                  <MachineProcessBadge info={usage} />
                )}

                {/* Completed machine badge */}
                {usage?.status === 'completed' && (
                  <div className="ml-5 mt-0.5 text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Дууссан</span>
                  </div>
                )}

                {/* Assign machine button (processing stage, not yet assigned) */}
                {isProcessing && !isProduct && !usage && (
                  <AssignInlineButton
                    item={item}
                    subIndex={item._subIndex}
                    order={order}
                    machines={machines}
                    onAssign={onMachineAction}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Total + action button */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Нийт дүн</span>
              {order.is_paid ? (
                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Төлөгдсөн</span>
              ) : (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full animate-pulse">Төлөгдөөгүй</span>
              )}
            </div>
            <span className="font-bold text-base text-gray-800">
              {order.total.toLocaleString()}₮
            </span>
          </div>

          {/* Зүйл нэмэх товч (зөвхөн төлбөр төлөгдөөгүй) */}
          {!order.is_paid && (
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100
                         text-blue-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors mb-2
                         border border-blue-200"
            >
              <Plus className="w-3.5 h-3.5" />
              Үйлчилгээ / бараа нэмэх
            </button>
          )}

          {/* Төлбөр авах товч */}
          {!order.is_paid && (
            <button
              onClick={() => setShowPayModal(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600
                         text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors mb-2"
            >
              <Banknote className="w-3.5 h-3.5" />
              Төлбөр авах — {order.total.toLocaleString()}₮
            </button>
          )}

          {/* Төлбөр огт төлөлгүй явсан → анхааруулгын жагсаалтад оруулах */}
          {!order.is_paid && !order.is_flagged && (
            <button
              onClick={() => setShowFlagModal(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100
                         text-amber-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors mb-2
                         border border-amber-300"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Төлбөргүй явсан — Анхааруулгад нэмэх
            </button>
          )}

          {/* Pay Modal */}
          {showPayModal && (
            <PayModal
              order={order}
              onClose={() => setShowPayModal(false)}
              onPay={(method, details) => { onPay(order.id, method, details); setShowPayModal(false) }}
            />
          )}

          {/* Flag Modal */}
          {showFlagModal && (
            <FlagModal
              order={order}
              onClose={() => setShowFlagModal(false)}
              onConfirm={(reason) => { onFlag(order.id, reason); setShowFlagModal(false) }}
            />
          )}

          {/* Add item Modal */}
          {showAddModal && (
            <AddItemModal
              order={order}
              onClose={() => setShowAddModal(false)}
              onAdded={onMachineAction}
            />
          )}

          {/* Processing: show progress */}
          {isProcessing && serviceUnits.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Үйлчилгээ</span>
                <span>{serviceUnits.filter(i => usageMap[_ukey(i.id, i._subIndex)]?.status === 'completed').length}/{serviceUnits.length} дууссан</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-green-500 transition-all"
                  style={{ width: `${(serviceUnits.filter(i => usageMap[_ukey(i.id, i._subIndex)]?.status === 'completed').length / serviceUnits.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {nextStatus && (
            <button
              onClick={() => onUpdateStatus(order.id, nextStatus)}
              disabled={(isProcessing && !allServicesDone) || (nextStatus === 'delivered' && !canDeliver)}
              className={`w-full flex items-center justify-center gap-1.5 text-white text-xs font-semibold
                         px-3 py-2 rounded-lg transition-colors
                         ${(isProcessing && !allServicesDone) || (nextStatus === 'delivered' && !canDeliver)
                           ? 'bg-gray-300 cursor-not-allowed'
                           : nextStatus === 'delivered' && !order.is_paid
                             ? 'bg-amber-500 hover:bg-amber-600'
                             : status.btn}`}
            >
              {nextStatus === 'delivered'
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />
              }
              {nextLabel}
            </button>
          )}

          {/* Delivered: archive (just visual, already delivered) */}
          {isDelivered && (
            <div className="flex items-center justify-center gap-1.5 text-gray-400 text-xs py-1">
              <Archive className="w-3.5 h-3.5" />
              Олгогдсон
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


/* ── Inline assign button (within OrderCard) ──────────── */
function AssignInlineButton({ item, subIndex = 0, order, machines, onAssign }) {
  const [showPicker, setShowPicker] = useState(false)

  // Filter machines by service.machine_ids linkage
  const serviceMachineIds = item.service?.machine_ids || []
  const availableMachines = machines.filter(m => {
    if (!m.is_active) return false
    if (m.current_usage) return false  // busy
    // If service has linked machines, only show those; otherwise show all
    if (serviceMachineIds.length > 0 && !serviceMachineIds.includes(m.id)) return false
    return true
  })

  const handleAssign = async (machineId) => {
    try {
      const duration = item.service?.duration_min || 60
      await machinesApi.assign(machineId, {
        order_id: order.id,
        order_item_id: item.id,
        sub_index: subIndex,
        duration_min: duration,
      })
      toast.success('Машин ажиллаж эхэллээ')
      setShowPicker(false)
      onAssign?.()
    } catch {}
  }

  if (!showPicker) {
    return (
      <button
        onClick={() => setShowPicker(true)}
        className="ml-5 mt-0.5 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
      >
        <Play className="w-3 h-3" />
        <span>Машин сонгох</span>
      </button>
    )
  }

  return (
    <div className="ml-5 mt-1 flex flex-wrap gap-1">
      {availableMachines.length === 0 ? (
        <span className="text-xs text-gray-400">Сул машин байхгүй</span>
      ) : (
        availableMachines.map(m => (
          <button
            key={m.id}
            onClick={() => handleAssign(m.id)}
            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg border border-blue-200 transition-colors"
          >
            {m.name}
          </button>
        ))
      )}
      <button
        onClick={() => setShowPicker(false)}
        className="text-xs text-gray-400 hover:text-gray-600 px-1"
      >
        ✕
      </button>
    </div>
  )
}


/* ── Machine Process Badge ───────────────────────────── */
function MachineProcessBadge({ info }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const raw = info.startedAt
  const start = dayjs(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
  const endTime = start.add(info.durationMin, 'minute')
  const remainSec = Math.max(0, endTime.diff(now, 'second'))
  const isOverdue = remainSec <= 0

  const mins = Math.floor(remainSec / 60)
  const secs = remainSec % 60
  const label = isOverdue ? 'Дууссан!' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div className={`ml-5 mt-0.5 flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full
      ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
      <Loader2 className={`w-3 h-3 ${isOverdue ? '' : 'animate-spin'}`} />
      <span className="font-medium">{info.machineName}</span>
      <span className="font-mono">{label}</span>
    </div>
  )
}


/* ── Flag Modal (төлбөр төлөлгүй явсан) ────────────────── */
function FlagModal({ order, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const who = order.customer?.name || order.phone || 'Харилцагчгүй'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Анхааруулгад нэмэх
            </h3>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-3xl font-black mt-2 tracking-tight">
            {order.total.toLocaleString()}₮
          </p>
          <p className="text-center text-xs text-amber-100 mt-0.5">төлөгдөөгүй үлдэгдэл</p>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Захиалга</span>
              <span className="font-bold text-gray-800">#{order.order_number.split('-').pop()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Үйлчлүүлэгч</span>
              <span className="font-bold text-gray-800">{who}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            Энэ захиалга дараалалаас гарч <b className="text-amber-700">Анхааруулга</b> жагсаалтад
            орно. POS дээр тухайн харилцагч сонгогдох үед улаанаар анхааруулна.
            Жагсаалтаас хасах эрх зөвхөн админд байна.
          </p>

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="Тайлбар (заавал биш) — жишээ: мөнгөө авчирна гэж явсан"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none bg-gray-50
                       focus:outline-none focus:ring-2 focus:ring-amber-400"
          />

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl
                         text-sm hover:bg-gray-50 transition-colors">
              Болих
            </button>
            <button onClick={() => onConfirm(reason)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl
                         text-sm transition-colors shadow-md shadow-amber-200">
              Нэмэх
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ── Add Item Modal (төлбөр төлөгдөөгүй захиалгад нэмэх) ── */
function AddItemModal({ order, onClose, onAdded }) {
  const [tab, setTab]           = useState('services')   // services | products
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [addingKey, setAddingKey] = useState(null)

  useEffect(() => {
    Promise.all([
      servicesApi.list({ active_only: true }),
      inventoryApi.list({ for_sale: true }),
    ])
      .then(([s, p]) => {
        setServices(s.data || [])
        setProducts((p.data || []).filter(x => x.sale_price != null))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const add = async (item, type) => {
    const key = `${type}_${item.id}`
    setAddingKey(key)
    try {
      const payload = type === 'service'
        ? { service_id: item.id, quantity: 1 }
        : { product_id: item.id, quantity: 1 }
      await ordersApi.addItem(order.id, payload)
      toast.success(`${item.name} нэмэгдлээ`)
      onAdded?.()
    } catch { /* interceptor-аар алдаа харагдана */ } finally { setAddingKey(null) }
  }

  const q = search.trim().toLowerCase()
  const list = tab === 'services'
    ? services.filter(s => !q || s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q))
    : products.filter(p => !q || p.name.toLowerCase().includes(q))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h3 className="font-bold text-base text-gray-800">
              Зүйл нэмэх — #{order.order_number.split('-').pop()}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Үйлчилгээ эсвэл бараа сонгоно уу</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {[
            { key: 'services', label: 'Үйлчилгээ',     icon: Wrench },
            { key: 'products', label: 'Бараа материал', icon: Package },
          ].map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors
                  ${tab === t.key ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="px-4 py-2 shrink-0 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'services' ? 'Үйлчилгээ хайх...' : 'Бараа хайх...'}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Уншиж байна...</p>
          ) : list.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Олдсонгүй</p>
          ) : tab === 'services' ? (
            list.map(s => (
              <button key={s.id} onClick={() => add(s, 'service')} disabled={addingKey === `service_${s.id}`}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-200
                           hover:border-blue-300 hover:bg-blue-50 transition-colors text-left disabled:opacity-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.price.toLocaleString()}₮ · ⏱ {s.duration_min}мин</p>
                </div>
                {addingKey === `service_${s.id}`
                  ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                  : <Plus className="w-5 h-5 text-blue-500 shrink-0" />}
              </button>
            ))
          ) : (
            list.map(p => (
              <button key={p.id} onClick={() => add(p, 'product')}
                disabled={addingKey === `product_${p.id}` || p.quantity <= 0}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-200
                           hover:border-green-300 hover:bg-green-50 transition-colors text-left disabled:opacity-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {(p.sale_price ?? 0).toLocaleString()}₮ · үлдэгдэл {p.quantity}{p.unit}
                  </p>
                </div>
                {addingKey === `product_${p.id}`
                  ? <Loader2 className="w-5 h-5 text-green-500 animate-spin shrink-0" />
                  : <Plus className="w-5 h-5 text-green-500 shrink-0" />}
              </button>
            ))
          )}
        </div>

        {/* Footer — захиалгын одоогийн дүн (нэмсний дараа шинэчлэгдэнэ) */}
        <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-400">Захиалгын дүн</span>
          <span className="font-bold text-gray-800">{order.total.toLocaleString()}₮</span>
        </div>
      </div>
    </div>
  )
}
