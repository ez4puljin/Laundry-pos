import { useState } from 'react'
import { X, LogIn, Clock, ShowerHead, UserX, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { roomsApi } from '../api/client'
import { useElapsed } from '../hooks/useCountdown'
import { roomStatus, queueLabel } from './RoomMap'


/* ── Сул өрөө оноох цонх ──────────────────────────────── */
export function AdmitModal({ session, rooms, onClose, onAssigned }) {
  const [busy, setBusy] = useState(false)
  const free = rooms.filter(r => r.is_active && roomStatus(r) === 'free')
  const matching = free.filter(r => r.room_type_id === session.room_type_id)
  const others   = free.filter(r => r.room_type_id !== session.room_type_id)

  const assign = async (room) => {
    setBusy(true)
    try {
      await roomsApi.assign(session.id, room.id)
      toast.success(`Оочир ${queueLabel(session.queue_no)} → Өрөө №${room.number}`)
      onAssigned?.()
      onClose()
    } catch {
      onAssigned?.()   // өрөө завгүй болсон байж болно — жагсаалт сэргээнэ
    } finally {
      setBusy(false)
    }
  }

  const RoomBtn = ({ room, highlight }) => (
    <button
      key={room.id}
      disabled={busy}
      onClick={() => assign(room)}
      className={`p-3 rounded-xl border-2 text-left transition-all hover:shadow-md disabled:opacity-50
                  ${highlight ? 'border-green-400 bg-green-50 ring-1 ring-green-300' : 'border-gray-200 bg-white'}`}
    >
      <div className="font-bold text-gray-800">Өрөө №{room.number}</div>
      <div className="text-xs text-gray-500">{room.room_type?.name}</div>
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-800">Өрөө оруулах</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Оочир {queueLabel(session.queue_no)} · {session.type_name} · {session.customer_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {free.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-6">Сул өрөө одоогоор алга байна</div>
          )}
          {matching.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-700 mb-2">Тохирох төрөл</div>
              <div className="grid grid-cols-2 gap-2">
                {matching.map(r => <RoomBtn key={r.id} room={r} highlight />)}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2">Өөр төрөл — кассчин шийднэ</div>
              <div className="grid grid-cols-2 gap-2">
                {others.map(r => <RoomBtn key={r.id} room={r} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


/* ── Дарааллын нэг мөр ────────────────────────────────── */
function QueueRow({ session, isNext, onAdmit, onCancel, onNoShow, onArrived, readOnly }) {
  const { label: waited } = useElapsed(session.created_at)
  const noShow = session.no_show

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border
      ${noShow ? 'border-orange-200 bg-orange-50/60'
               : isNext ? 'border-cyan-300 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
      {/* Оочирын тасалбар — өрөөний дугаараас ялгарах шар өнгө + «ООЧИР» тайлбар */}
      <div className={`flex-shrink-0 w-16 text-center rounded-lg py-1 border
        ${noShow ? 'bg-white border-orange-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="text-[9px] font-bold text-amber-500 tracking-widest leading-none">ООЧИР</div>
        <div className="font-black text-amber-700 leading-tight tabular-nums">{queueLabel(session.queue_no)}</div>
        {noShow
          ? <div className="text-[9px] text-orange-600 font-bold leading-none pb-0.5">Ирээгүй</div>
          : isNext && <div className="text-[9px] text-cyan-600 font-bold leading-none pb-0.5">Дараагийн</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{session.type_name}</div>
        <div className="text-xs text-gray-500 flex items-center gap-2 truncate">
          <span className="truncate">{session.customer_name}</span>
          <span className="inline-flex items-center gap-0.5 flex-shrink-0">
            <Clock size={11} /> {waited}
          </span>
          {noShow && (
            <span className="text-orange-600 font-medium flex-shrink-0">· ирмэгц эхэнд орно</span>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {noShow ? (
            <button
              onClick={() => onArrived(session)}
              title="Ирсэн — оочир нь эргэн тэргүүнд орно"
              className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700
                         inline-flex items-center gap-1"
            >
              <UserCheck size={13} /> Ирсэн
            </button>
          ) : (
            <button
              onClick={() => onNoShow(session)}
              title="Дуудахад ирээгүй — дараагийн хүн рүү алгасна"
              className="px-2.5 py-1.5 rounded-lg border border-orange-300 text-orange-600 text-xs font-medium
                         hover:bg-orange-50 inline-flex items-center gap-1"
            >
              <UserX size={13} /> Ирээгүй
            </button>
          )}
          <button
            onClick={() => onAdmit(session)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700
                       inline-flex items-center gap-1"
          >
            <LogIn size={13} /> Оруулах
          </button>
          <button
            onClick={() => onCancel(session)}
            title="Цуцлах"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}


/* ── Хүлээж буй дараалал — өрөөний ТӨРӨЛ бүрээр тусдаа ──── */
export default function QueuePanel({ waiting = [], rooms = [], types = [], onRefresh, readOnly = false }) {
  const [admitting, setAdmitting] = useState(null)

  const handleCancel = async (session) => {
    const ok = window.confirm(
      `${session.type_name} — Оочир ${queueLabel(session.queue_no)} тасалбарыг цуцлах уу?\n\n` +
      'Төлбөр буцаахгүй. Буцаалт хийх бол захиалгыг устгана уу.'
    )
    if (!ok) return
    try {
      await roomsApi.cancelTicket(session.id)
      toast.success('Тасалбар цуцлагдлаа')
      onRefresh?.()
    } catch { /* interceptor toast */ }
  }

  const handleNoShow = async (session) => {
    try {
      await roomsApi.noShow(session.id)
      toast(`Оочир ${queueLabel(session.queue_no)} — ирээгүй. Дараагийн хүн рүү шилжлээ, оочир нь хадгалагдана.`,
            { icon: '⏭️' })
      onRefresh?.()
    } catch {}
  }

  const handleArrived = async (session) => {
    try {
      await roomsApi.arrived(session.id)
      toast.success(`Оочир ${queueLabel(session.queue_no)} ирлээ — эргэн тэргүүнд орлоо`)
      onRefresh?.()
    } catch {}
  }

  // Төрлүүд мэдэгдэж байвал тэр эрэмбээр, үгүй бол дарааллаас нь гаргаж бүлэглэнэ
  const groups = types.length
    ? types.map(t => ({ id: t.id, name: t.name, color: t.color, items: waiting.filter(w => w.room_type_id === t.id) }))
    : waiting.reduce((acc, s) => {
        let g = acc.find(x => x.id === s.room_type_id)
        if (!g) { g = { id: s.room_type_id, name: s.type_name, items: [] }; acc.push(g) }
        g.items.push(s)
        return acc
      }, [])

  const freeFor = (typeId) =>
    rooms.filter(r => r.room_type_id === typeId && r.is_active && roomStatus(r) === 'free').length

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <ShowerHead size={15} className="text-cyan-600" />
          Хүлээж байна
          {waiting.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 text-xs">{waiting.length}</span>
          )}
        </h3>
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-6 rounded-xl border border-dashed border-gray-200">
          Дараалал хоосон байна
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(g => (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5 min-w-0">
                  {g.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />}
                  <span className="truncate">{g.name}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0 text-xs">
                  <span className="px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 font-medium">
                    {g.items.length}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-md font-medium
                                    ${freeFor(g.id) > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    Сул {freeFor(g.id)}
                  </span>
                </span>
              </div>

              {g.items.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-4">Хоосон</div>
              ) : (
                <div className="space-y-2">
                  {g.items.map(s => (
                    <QueueRow
                      key={s.id}
                      session={s}
                      isNext={s.id === g.items.find(x => !x.no_show)?.id}
                      readOnly={readOnly}
                      onAdmit={setAdmitting}
                      onCancel={handleCancel}
                      onNoShow={handleNoShow}
                      onArrived={handleArrived}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {admitting && (
        <AdmitModal
          session={admitting}
          rooms={rooms}
          onClose={() => setAdmitting(null)}
          onAssigned={onRefresh}
        />
      )}
    </div>
  )
}
