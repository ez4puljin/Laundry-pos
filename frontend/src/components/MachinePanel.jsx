import { useState, useEffect } from 'react'
import { X, Play, Square, BarChart3, Clock, User, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import { machinesApi, ordersApi, categoriesApi } from '../api/client'
import useCountdown from '../hooks/useCountdown'

const TYPE_LABELS = {
  washer:      '🧼 Угаалга',
  dryer:       '🌬️ Хатаалга',
  shoe_washer: '👟 Пүүз',
}

const TYPE_COLORS = {
  washer:      { idle: 'border-blue-200 bg-blue-50',   running: 'border-blue-400 bg-blue-50',   badge: 'bg-blue-100 text-blue-700' },
  dryer:       { idle: 'border-orange-200 bg-orange-50', running: 'border-orange-400 bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
  shoe_washer: { idle: 'border-purple-200 bg-purple-50', running: 'border-purple-400 bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
}

/* ── Machine Card ─────────────────────────────────────── */
function MachineCard({ machine, onClickIdle, onComplete }) {
  const usage = machine.current_usage
  const isRunning = !!usage
  const colors = TYPE_COLORS[machine.machine_type] || TYPE_COLORS.washer
  const { label: timeLabel, progress, isOverdue } = useCountdown(
    usage?.started_at, usage?.duration_min
  )

  if (!isRunning) {
    return (
      <button
        onClick={() => onClickIdle(machine)}
        className={`flex-shrink-0 w-36 rounded-xl border-2 border-dashed ${colors.idle}
                    p-3 cursor-pointer hover:shadow-md transition-all text-center`}
      >
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-1.5 ${colors.badge}`}>
          {TYPE_LABELS[machine.machine_type] || machine.machine_type}
        </div>
        <p className="font-semibold text-sm text-gray-700 mb-1">{machine.name}</p>
        <p className="text-xs text-green-600 font-medium">🟢 Сул</p>
      </button>
    )
  }

  return (
    <div className={`flex-shrink-0 w-44 rounded-xl border-2 ${isOverdue ? 'border-red-400 bg-red-50 animate-pulse' : colors.running}
                     p-3 transition-all shadow-sm`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {TYPE_LABELS[machine.machine_type]}
        </span>
      </div>
      <p className="font-semibold text-sm text-gray-700 mb-1">{machine.name}</p>

      {/* Timer */}
      <div className={`text-2xl font-mono font-bold text-center my-1.5
        ${isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
        {timeLabel}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full transition-all ${isOverdue ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Info */}
      <div className="space-y-0.5 mb-2">
        <p className="text-xs text-gray-600 truncate flex items-center gap-1">
          <User className="w-3 h-3" /> {usage.customer_name}
        </p>
        <p className="text-xs text-gray-500 truncate flex items-center gap-1">
          <Clock className="w-3 h-3" /> {usage.service_name}
        </p>
      </div>

      {/* Complete button */}
      <button
        onClick={() => onComplete(machine.id)}
        className={`w-full flex items-center justify-center gap-1 text-xs font-semibold py-1.5 rounded-lg
          text-white transition-colors ${isOverdue ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-500 hover:bg-gray-600'}`}
      >
        <Square className="w-3 h-3" />
        {isOverdue ? 'Дууссан! Зогсоох' : 'Дууслаа'}
      </button>
    </div>
  )
}


/* ── Assignment Modal ─────────────────────────────────── */
function AssignModal({ machine, onClose, onAssign }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await ordersApi.queue()
        const filtered = (res.data || []).filter(o =>
          ['pending', 'washing', 'ironing'].includes(o.status)
        )
        setOrders(filtered)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = (order, item) => {
    const duration = item.service?.duration_min || 60
    onAssign(machine.id, {
      order_id: order.id,
      order_item_id: item.id,
      duration_min: duration,
    })
  }

  // Захиалга тус бүрд зөвхөн тухайн машинд холбогдсон service items шүүх
  const filteredOrders = orders.map(order => {
    const serviceItems = order.items.filter(i => {
      if (i.item_type !== 'service') return false
      const machineIds = i.service?.machine_ids || []
      // machine_ids хоосон бол бүгдийг харуулна (backward compat)
      if (machineIds.length === 0) return true
      return machineIds.includes(machine.id)
    })
    return { ...order, filteredItems: serviceItems }
  }).filter(o => o.filteredItems.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-bold text-base text-gray-800">Машинд хуваарилах</h3>
            <p className="text-xs text-gray-500 mt-0.5">{machine.name} — үйлчилгээ сонгоно уу</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-gray-400 py-8">Уншиж байна...</p>
          ) : filteredOrders.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Тохирох захиалга байхгүй</p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => {
                const customerName = order.customer?.name || order.phone || '—'
                return (
                  <div key={order.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-gray-700">
                        #{order.order_number.split('-').pop()}
                      </span>
                      <span className="text-xs text-gray-500">👤 {customerName}</span>
                    </div>
                    <div className="space-y-1.5">
                      {order.filteredItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(order, item)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                                     bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent
                                     transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-700">{item.item_name || item.service?.name}</p>
                            <p className="text-xs text-gray-400">
                              {item.service?.duration_min || 60} мин · ×{item.quantity}
                            </p>
                          </div>
                          <Play className="w-4 h-4 text-blue-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


/* ── Daily Summary ────────────────────────────────────── */
function DailySummary({ show }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!show) return
    setLoading(true)
    machinesApi.dailySummary()
      .then(res => setData(res.data || []))
      .finally(() => setLoading(false))
  }, [show])

  if (!show) return null

  return (
    <div className="mt-3 bg-white rounded-xl border p-4">
      <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" /> Өнөөдрийн машинуудын тайлан
      </h4>
      {loading ? (
        <p className="text-xs text-gray-400">Уншиж байна...</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {data.map(d => {
            const hrs = Math.floor(d.total_minutes / 60)
            const mins = d.total_minutes % 60
            const timeStr = hrs > 0 ? `${hrs}ц ${mins}мин` : `${mins}мин`
            return (
              <div key={d.machine_id} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="font-semibold text-sm text-gray-700">{d.machine_name}</p>
                <p className="text-lg font-bold text-blue-600 mt-1">{d.total_services}</p>
                <p className="text-xs text-gray-500">үйлчилгээ</p>
                <p className="text-xs text-gray-400 mt-0.5">{timeStr}</p>
              </div>
            )
          })}
          {data.length === 0 && (
            <p className="text-xs text-gray-400 col-span-full">Өнөөдөр ашиглалт бүртгэгдээгүй</p>
          )}
        </div>
      )}
    </div>
  )
}


/* ── Main MachinePanel ────────────────────────────────── */
export default function MachinePanel({ machines, onAssign, onComplete }) {
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [showSummary, setShowSummary] = useState(false)

  const handleAssign = async (machineId, data) => {
    try {
      await machinesApi.assign(machineId, data)
      toast.success('Машин ажиллаж эхэллээ')
      setSelectedMachine(null)
      onAssign?.()
    } catch {}
  }

  const handleComplete = async (machineId) => {
    try {
      await machinesApi.complete(machineId)
      toast.success('Машин чөлөөлөгдлөө')
      onComplete?.()
    } catch {}
  }

  if (!machines || machines.length === 0) return null

  return (
    <div className="px-4 pt-3">
      <div className="bg-white rounded-xl border shadow-sm p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm text-gray-700 flex items-center gap-2">
            🔧 Машинууд
            <span className="text-xs font-normal text-gray-400">
              ({machines.filter(m => m.current_usage).length}/{machines.length} ажиллаж байна)
            </span>
          </h2>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Тайлан
            {showSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Machine cards — sorted: washer → shoe_washer → dryer → other */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[...machines].sort((a, b) => {
            const order = { washer: 0, shoe_washer: 1, dryer: 2 }
            const ao = order[a.machine_type] ?? 99
            const bo = order[b.machine_type] ?? 99
            if (ao !== bo) return ao - bo
            return a.id - b.id
          }).map(m => (
            <MachineCard
              key={m.id}
              machine={m}
              onClickIdle={(machine) => setSelectedMachine(machine)}
              onComplete={handleComplete}
            />
          ))}
        </div>

        {/* Daily summary */}
        <DailySummary show={showSummary} />
      </div>

      {/* Assignment modal */}
      {selectedMachine && (
        <AssignModal
          machine={selectedMachine}
          onClose={() => setSelectedMachine(null)}
          onAssign={handleAssign}
        />
      )}
    </div>
  )
}
