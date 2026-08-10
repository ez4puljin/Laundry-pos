import useCountdown from '../hooks/useCountdown'

/* Виртуал grid — админ зураглал болон харуулалт хоёулаа энэ хэмжээг ашиглана */
export const GRID_COLS = 24
export const GRID_ROWS = 14

/* Өрөөний статусын нэг эх сурвалж */
export const STATUS_META = {
  free:              { label: 'Сул',                  box: 'border-green-400  bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  reserved:          { label: 'Хүлээгдэж буй',        box: 'border-amber-400  bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500'  },
  in_use:            { label: 'Ашиглаж байна',        box: 'border-blue-400   bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  awaiting_cleaning: { label: 'Цэвэрлэгээ хүлээж буй', box: 'border-orange-400 bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500' },
  cleaning:          { label: 'Цэвэрлэж байна',        box: 'border-purple-400 bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500' },
  inactive:          { label: 'Идэвхгүй',              box: 'border-gray-300   bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
}

export function roomStatus(room) {
  if (!room.is_active) return 'inactive'
  if (!room.active_session) return 'free'
  return room.active_session.status
}

/* Дарааллын дугаар — төрөл бүрээр тусдаа тоологддог, 3 оронтой (001) */
export const queueLabel = (n) => String(n ?? 0).padStart(3, '0')

/* Grid хэмжээст background шугамууд */
const gridBg = {
  backgroundImage:
    `linear-gradient(to right,  rgba(0,0,0,.06) 1px, transparent 1px),
     linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)`,
  backgroundSize: `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
}


/* ── Нэг өрөөний нүд ──────────────────────────────────────
   Агуулгыг нүдний хэмжээнд тааруулна: жижиг нүдэнд зөвхөн
   хамгийн чухал мэдээлэл (дугаар / таймер) үлдэж, статус нь
   өнгө болон буланд байрлах цэгээр илэрхийлэгдэнэ. */
function RoomCell({ room, onClick, selected }) {
  const status  = roomStatus(room)
  const meta    = STATUS_META[status]
  const session = room.active_session
  const { label: timeLabel, isOverdue } = useCountdown(
    status === 'in_use' ? session?.started_at : null,
    session?.duration_min
  )

  const overdue = status === 'in_use' && isOverdue
  const boxCls  = overdue ? 'border-red-500 bg-red-50 animate-pulse' : meta.box

  const w = room.map_w || 1
  const h = room.map_h || 1
  // Хэдэн мөр текст багтахыг өндрөөр, урт багтахыг өргөнөөр шийднэ
  const density = h >= 3 && w >= 3 ? 'full' : h >= 2 && w >= 2 ? 'mid' : 'tiny'
  const numCls  = density === 'full' ? 'text-base' : density === 'mid' ? 'text-sm' : 'text-[11px]'
  const timeCls = density === 'full' ? 'text-sm'   : density === 'mid' ? 'text-xs' : 'text-[10px]'

  const tip = [
    `Өрөө №${room.number}`,
    room.room_type?.name,
    overdue ? 'Хугацаа хэтэрсэн!' : meta.label,
    session?.queue_no > 0 ? `Дараалал ${queueLabel(session.queue_no)}` : null,
    status === 'in_use' ? `Үлдсэн ${timeLabel}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <button
      onClick={() => onClick?.(room)}
      title={tip}
      style={{
        left:   `${(room.map_x / GRID_COLS) * 100}%`,
        top:    `${(room.map_y / GRID_ROWS) * 100}%`,
        width:  `${(room.map_w / GRID_COLS) * 100}%`,
        height: `${(room.map_h / GRID_ROWS) * 100}%`,
      }}
      className={`absolute p-0.5 rounded-lg border-2 ${boxCls} ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                  flex flex-col items-center justify-center overflow-hidden leading-none
                  transition-all hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Жижиг нүдэнд статусыг буланд байрлах цэгээр илэрхийлнэ */}
      {density === 'tiny' && (
        <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full
                          ${overdue ? 'bg-red-500' : meta.dot}`} />
      )}

      {/* Ашиглаж байгаа жижиг нүдэнд таймер дугаараас чухал */}
      {density === 'tiny' && status === 'in_use' ? (
        <span className={`font-mono font-bold ${timeCls} ${overdue ? 'text-red-600' : 'text-blue-700'}`}>
          {overdue ? '!' : timeLabel}
        </span>
      ) : (
        <span className={`font-bold text-gray-800 ${numCls}`}>
          {density === 'tiny' ? room.number : `№${room.number}`}
        </span>
      )}

      {density === 'full' && (
        <span className="text-[10px] text-gray-500 truncate max-w-full mt-0.5">
          {room.room_type?.name}
        </span>
      )}

      {density !== 'tiny' && (
        status === 'in_use' ? (
          <span className={`font-mono font-bold mt-0.5 ${timeCls} ${overdue ? 'text-red-600' : 'text-blue-700'}`}>
            {overdue ? 'ХЭТЭРСЭН' : timeLabel}
          </span>
        ) : (
          <span className={`text-[10px] font-medium mt-0.5 ${meta.text} truncate max-w-full`}>
            {meta.label}
          </span>
        )
      )}

      {density === 'full' && session?.queue_no > 0 && status === 'reserved' && (
        <span className="text-[10px] font-bold text-amber-700 mt-0.5">
          {queueLabel(session.queue_no)}
        </span>
      )}
    </button>
  )
}


/* ── Зураглал ─────────────────────────────────────────── */
export default function RoomMap({ rooms = [], onRoomClick, selectedId, children }) {
  const placed   = rooms.filter(r => r.map_x != null && r.map_w > 0)
  const unplaced = rooms.filter(r => (r.map_x == null || !r.map_w) && r.is_active)

  return (
    <div>
      <div
        className="relative w-full rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
        style={{ aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`, ...gridBg }}
      >
        {placed.map(r => (
          <RoomCell key={r.id} room={r} onClick={onRoomClick} selected={selectedId === r.id} />
        ))}
        {placed.length === 0 && !children && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 text-center px-4">
            Өрөө байрлуулаагүй байна.<br />Удирдлага → Шүршүүр цэснээс зураглалаа зурна уу.
          </div>
        )}
        {children}
      </div>

      {unplaced.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">Байрлуулаагүй өрөө</div>
          <div className="flex flex-wrap gap-2">
            {unplaced.map(r => {
              const meta = STATUS_META[roomStatus(r)]
              return (
                <button
                  key={r.id}
                  onClick={() => onRoomClick?.(r)}
                  className={`px-3 py-1.5 rounded-lg border-2 ${meta.box} text-xs font-medium ${meta.text}
                              ${selectedId === r.id ? 'ring-2 ring-blue-500' : ''}`}
                >
                  №{r.number} · {meta.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Тайлбар (legend) ─────────────────────────────────── */
export function RoomLegend({ rooms = [], waitingCount = 0 }) {
  const counts = rooms.reduce((acc, r) => {
    const s = roomStatus(r)
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  const shown = ['free', 'reserved', 'in_use', 'awaiting_cleaning', 'cleaning']

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {shown.map(s => (
        <span key={s} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200">
          <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
          <span className="text-gray-600">{STATUS_META[s].label}</span>
          <span className="font-bold text-gray-800">{counts[s] || 0}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200">
        <span className="w-2 h-2 rounded-full bg-cyan-500" />
        <span className="text-gray-600">Хүлээж байна</span>
        <span className="font-bold text-gray-800">{waitingCount}</span>
      </span>
    </div>
  )
}
