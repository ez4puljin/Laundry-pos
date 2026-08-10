import { useState } from 'react'
import { Play, LogOut, Brush, CheckCircle2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { roomsApi } from '../api/client'
import useCountdown from '../hooks/useCountdown'
import { roomStatus, STATUS_META, queueLabel } from './RoomMap'

/* Өрөөний статус бүрийн дараагийн үйлдэл — POS болон Шүршүүр хуудас хуваалцана */
export const ROOM_ACTIONS = {
  reserved: {
    label: 'Эхлүүлэх', icon: Play, api: 'start',
    cls: 'bg-green-600 hover:bg-green-700',
    roles: ['admin', 'cashier'],
    hint: 'Үйлчлүүлэгч орлоо — хугацаа тоологдож эхэлнэ',
    done: (r) => `Өрөө №${r} эхэллээ`,
  },
  in_use: {
    label: 'Гарсан', icon: LogOut, api: 'finish',
    cls: 'bg-blue-600 hover:bg-blue-700',
    roles: ['admin', 'cashier', 'cleaner'],
    hint: 'Үйлчлүүлэгч гарлаа — цэвэрлэгээ хүлээнэ',
    done: () => 'Гарсан — цэвэрлэгээ хүлээж байна',
  },
  awaiting_cleaning: {
    label: 'Цэвэрлэж эхлэх', icon: Brush, api: 'cleaningStart',
    cls: 'bg-orange-600 hover:bg-orange-700',
    roles: ['admin', 'cashier', 'cleaner'],
    hint: 'Үйлчлэгч цэвэрлэж эхэллээ',
    done: () => 'Цэвэрлэгээ эхэллээ',
  },
  cleaning: {
    label: 'Цэвэрлэж дууссан', icon: CheckCircle2, api: 'cleaningDone',
    cls: 'bg-purple-600 hover:bg-purple-700',
    roles: ['admin', 'cashier', 'cleaner'],
    hint: 'Цэвэрлэгээ дуусаж, өрөө сул болно',
    done: (r) => `Өрөө №${r} сул боллоо`,
  },
}

/** Өрөөн дээр үйлдэл гүйцэтгэнэ. Амжилттай бол true буцаана. */
export async function runRoomAction(room, action) {
  try {
    await roomsApi[action.api](room.id)
    toast.success(action.done(room.number))
    return true
  } catch {
    return false   // алдааны toast-ыг interceptor гаргана
  }
}


/* ── Өрөөний үйлдлийн цонх (POS-оос дуудагдана) ────────── */
export default function RoomActionModal({ room, role, onClose, onDone }) {
  const [busy, setBusy] = useState(false)

  const status  = roomStatus(room)
  const meta    = STATUS_META[status]
  const session = room.active_session
  const action  = ROOM_ACTIONS[status]
  const allowed = action && action.roles.includes(role)

  const { label: timeLabel, isOverdue, progress } = useCountdown(
    status === 'in_use' ? session?.started_at : null,
    session?.duration_min
  )
  const overdue = status === 'in_use' && isOverdue

  const handle = async () => {
    setBusy(true)
    const ok = await runRoomAction(room, action)
    setBusy(false)
    onDone?.()
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800">Өрөө №{room.number}</h3>
            <p className="text-xs text-gray-500 truncate">{room.room_type?.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className={`rounded-xl border-2 p-3 text-center ${overdue ? 'border-red-400 bg-red-50' : meta.box}`}>
            <div className={`text-sm font-semibold ${overdue ? 'text-red-700' : meta.text}`}>
              {overdue ? 'Хугацаа хэтэрсэн!' : meta.label}
            </div>
            {status === 'in_use' && (
              <>
                <div className={`font-mono font-bold text-3xl mt-1 ${overdue ? 'text-red-600 animate-pulse' : 'text-blue-700'}`}>
                  {overdue ? 'ХЭТЭРСЭН' : timeLabel}
                </div>
                <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${overdue ? 'bg-red-500' : 'bg-blue-500'}`}
                       style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>

          {session && (
            <div className="text-xs text-gray-600 space-y-1">
              {session.queue_no > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Оочир</span>
                  <span className="font-bold text-amber-700 bg-amber-50 px-1.5 rounded">{queueLabel(session.queue_no)}</span>
                </div>
              )}
              {session.customer_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Үйлчлүүлэгч</span>
                  <span className="truncate ml-2">{session.customer_name}</span>
                </div>
              )}
              {session.cleaned_by && status === 'cleaning' && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Үйлчлэгч</span>
                  <span className="truncate ml-2">{session.cleaned_by}</span>
                </div>
              )}
            </div>
          )}

          {action ? (
            <>
              <p className="text-xs text-gray-500 text-center">{action.hint}</p>
              <button
                disabled={!allowed || busy}
                onClick={handle}
                className={`w-full py-3 rounded-xl text-white text-sm font-semibold
                            inline-flex items-center justify-center gap-1.5 transition-colors
                            disabled:opacity-40 disabled:cursor-not-allowed ${action.cls}`}
              >
                <action.icon size={16} /> {action.label}
              </button>
              {!allowed && (
                <p className="text-xs text-red-500 text-center">Танд энэ үйлдлийн эрх алга</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-2">Хийх үйлдэл алга</p>
          )}
        </div>
      </div>
    </div>
  )
}
