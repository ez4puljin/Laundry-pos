import { useState, useEffect, useCallback } from 'react'
import { ShowerHead, RefreshCw, Tv } from 'lucide-react'
import { roomsApi, roomTypesApi } from '../api/client'
import useAuthStore from '../store/useAuthStore'
import useCountdown from '../hooks/useCountdown'
import RoomMap, { roomStatus, STATUS_META, RoomLegend, queueLabel } from '../components/RoomMap'
import QueuePanel from '../components/QueuePanel'
import { ROOM_ACTIONS as ACTIONS, runRoomAction } from '../components/RoomActions'


/* ── Өрөөний карт ─────────────────────────────────────── */
function RoomCard({ room, role, onAction, busy }) {
  const status  = roomStatus(room)
  const meta    = STATUS_META[status]
  const session = room.active_session
  const { label: timeLabel, isOverdue, progress } = useCountdown(
    status === 'in_use' ? session?.started_at : null,
    session?.duration_min
  )
  const action  = ACTIONS[status]
  const allowed = action && action.roles.includes(role)
  const overdue = status === 'in_use' && isOverdue

  return (
    <div className={`rounded-2xl border-2 p-4 ${overdue ? 'border-red-400 bg-red-50' : meta.box}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-lg text-gray-800">Өрөө №{room.number}</div>
          <div className="text-xs text-gray-500 truncate">{room.room_type?.name}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${meta.text} bg-white/70`}>
          {overdue ? 'Хугацаа хэтэрсэн!' : meta.label}
        </span>
      </div>

      {session && (
        <div className="mt-2 text-xs text-gray-600 space-y-0.5">
          {session.queue_no > 0 && (
            <div className="font-medium text-cyan-700">{queueLabel(session.queue_no)}</div>
          )}
          {session.customer_name && <div className="truncate">{session.customer_name}</div>}
          {session.cleaned_by && status === 'cleaning' && (
            <div className="truncate">Үйлчлэгч: {session.cleaned_by}</div>
          )}
        </div>
      )}

      {status === 'in_use' && (
        <div className="mt-3">
          <div className={`font-mono font-bold text-2xl text-center ${overdue ? 'text-red-600 animate-pulse' : 'text-blue-700'}`}>
            {overdue ? 'ХЭТЭРСЭН' : timeLabel}
          </div>
          <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overdue ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {action && (
        <button
          disabled={!allowed || busy}
          onClick={() => onAction(room, action)}
          className={`w-full mt-3 py-2.5 rounded-xl text-white text-sm font-semibold
                      inline-flex items-center justify-center gap-1.5 transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed ${action.cls}`}
        >
          <action.icon size={16} /> {action.label}
        </button>
      )}
      {!action && status === 'free' && (
        <div className="w-full mt-3 py-2.5 text-center text-sm text-green-700 font-medium">
          Сул байна
        </div>
      )}
    </div>
  )
}


/* ── Шүршүүрийн хяналтын хуудас ───────────────────────── */
export default function RoomsPage() {
  const [rooms, setRooms]     = useState([])
  const [waiting, setWaiting] = useState([])
  const [types, setTypes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)

  const role      = useAuthStore(s => s.user?.role)
  const isCleaner = role === 'cleaner'

  const fetchAll = useCallback(() => {
    Promise.all([roomsApi.list(), roomsApi.waiting()])
      .then(([r, w]) => { setRooms(r.data || []); setWaiting(w.data || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    roomTypesApi.list({ active_only: true }).then(r => setTypes(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 10000)
    return () => clearInterval(id)
  }, [fetchAll])

  const handleAction = async (room, action) => {
    setBusy(true)
    await runRoomAction(room, action)
    setBusy(false)
    fetchAll()
  }

  const activeRooms = rooms.filter(r => r.is_active)

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShowerHead className="text-cyan-600" /> Шүршүүр
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isCleaner ? 'Цэвэрлэгээний хяналт' : 'Өрөөний төлөв ба дараалал'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCleaner && (
            <a
              href="/tv" target="_blank" rel="noreferrer"
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600
                         hover:bg-gray-50 inline-flex items-center gap-1.5"
            >
              <Tv size={15} /> ТВ дэлгэц
            </a>
          )}
          <button
            onClick={fetchAll}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600
                       hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw size={15} /> Шинэчлэх
          </button>
        </div>
      </div>

      <RoomLegend rooms={activeRooms} waitingCount={waiting.length} />

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Уншиж байна...</div>
      ) : activeRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-2
                        bg-white rounded-2xl border border-dashed border-gray-200">
          <ShowerHead className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium">Өрөө бүртгэгдээгүй байна</p>
          <p className="text-xs text-gray-300">Удирдлага → Шүршүүр цэснээс өрөө нэмнэ үү</p>
        </div>
      ) : (
        <>
          {/* Зураглал */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <RoomMap rooms={activeRooms} />
          </div>

          {/* Өрөөний картууд */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeRooms.map(r => (
              <RoomCard key={r.id} room={r} role={role} onAction={handleAction} busy={busy} />
            ))}
          </div>
        </>
      )}

      {/* Дараалал */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <QueuePanel
          waiting={waiting}
          rooms={rooms}
          types={types}
          onRefresh={fetchAll}
          readOnly={isCleaner}
        />
      </div>
    </div>
  )
}
