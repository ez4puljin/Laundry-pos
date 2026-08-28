import { useState } from 'react'
import { X, LogIn, Clock, ShowerHead, UserX, UserCheck, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { roomsApi } from '../api/client'
import { useElapsed } from '../hooks/useCountdown'
import { roomStatus, queueLabel } from './RoomMap'


/* ── Сул өрөө оноох цонх ──────────────────────────────────
   ХЭД ХЭДЭН хүнийг НЭГ өрөөнд хамт оруулж болно:
     · Том хүн + Сургуулийн хүүхэд  → 2 хүний өрөө
     · Том хүн + Цэцэрлэгийн хүүхэд → 1 хүний өрөө
   Багтаамжийн хатуу хязгаарлалт байхгүй — үйлчлэгч өөрөө шийднэ.   */
export function AdmitModal({ session, waiting = [], rooms, onClose, onAssigned }) {
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState([session.id])

  const free = rooms.filter(r => r.is_active && roomStatus(r) === 'free')
  // Дарсан хүн эхэнд, бусад нь ард (ирээгүй хүмүүсийг оруулахгүй)
  const candidates = [session, ...waiting.filter(w => w.id !== session.id && !w.no_show)]
  const chosen = candidates.filter(w => picked.includes(w.id))

  const toggle = (id) => setPicked(p => {
    if (!p.includes(id)) return [...p, id]
    if (p.length === 1) return p          // хамгийн багадаа 1 хүн үлдэнэ
    return p.filter(x => x !== id)
  })

  const assign = async (room) => {
    setBusy(true)
    try {
      await roomsApi.assign(picked, room.id)
      const nums = chosen.map(c => queueLabel(c.queue_no)).join(', ')
      toast.success(`Оочир ${nums} → Өрөө №${room.number}`)
      onAssigned?.()
      onClose()
    } catch {
      onAssigned?.()   // өрөө завгүй болсон байж болно — жагсаалт сэргээнэ
    } finally {
      setBusy(false)
    }
  }

  // Өрөөнүүдийг төрлөөр нь бүлэглэнэ — зөвхөн зөвлөмж, хатуу шалгалтгүй
  const byType = free.reduce((acc, r) => {
    const name = r.room_type?.name || 'Бусад'
    ;(acc[name] ||= []).push(r)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Толгой */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h3 className="font-bold text-gray-800">Өрөөнд оруулах</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">

          {/* ── 1-р алхам: хэн орох вэ ── */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white text-[11px]
                                 flex items-center justify-center font-bold">1</span>
                Хэн орох вэ?
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
                {picked.length} хүн сонгосон
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Хамт орох хүмүүсээ дарж сонгоно уу — хэдэн ч хүнийг нэг өрөөнд оруулж болно
            </p>

            <div className="space-y-1.5">
              {candidates.map(w => {
                const on = picked.includes(w.id)
                return (
                  <button
                    key={w.id}
                    onClick={() => toggle(w.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2
                                text-left transition-all
                      ${on ? 'border-cyan-500 bg-cyan-50'
                           : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                  >
                    <span className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center
                      ${on ? 'bg-cyan-600 border-cyan-600' : 'border-gray-300 bg-white'}`}>
                      {on && <Check size={13} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className="font-black text-amber-700 bg-amber-50 border border-amber-200
                                     px-1.5 rounded tabular-nums text-sm shrink-0">
                      {queueLabel(w.queue_no)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-semibold truncate
                                        ${on ? 'text-cyan-800' : 'text-gray-700'}`}>
                        {w.type_name}
                      </span>
                      {w.customer_name && (
                        <span className="block text-xs text-gray-400 truncate">{w.customer_name}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            {candidates.length === 1 && (
              <p className="text-xs text-gray-400 mt-1.5">Дараалалд өөр хүн алга</p>
            )}
          </div>

          {/* ── 2-р алхам: аль өрөөнд ── */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-cyan-600 text-white text-[11px]
                               flex items-center justify-center font-bold">2</span>
              <span className="text-sm font-bold text-gray-800">Аль өрөөнд оруулах вэ?</span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Өрөө дарахад сонгосон {picked.length} хүн шууд орно
            </p>

            {free.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-6 rounded-xl
                              border border-dashed border-gray-200">
                Сул өрөө одоогоор алга байна
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(byType).map(([name, list]) => (
                  <div key={name}>
                    <div className="text-[11px] text-gray-400 mb-1">{name}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {list.map(r => (
                        <button
                          key={r.id}
                          disabled={busy}
                          onClick={() => assign(r)}
                          className="p-3 rounded-xl border-2 border-gray-200 bg-white text-left
                                     transition-all hover:shadow-md hover:border-cyan-400
                                     active:scale-[0.98] disabled:opacity-50"
                        >
                          <div className="font-bold text-gray-800">Өрөө №{r.number}</div>
                          <div className="text-xs text-gray-500">{r.room_type?.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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


/* ── Хүлээж буй дараалал — НЭГДСЭН (дугаарлалт өдөр бүр глобал) ── */
export default function QueuePanel({ waiting = [], rooms = [], onRefresh, readOnly = false }) {
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

  const freeCount = rooms.filter(r => r.is_active && roomStatus(r) === 'free').length
  const nextId    = waiting.find(x => !x.no_show)?.id

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <ShowerHead size={15} className="text-cyan-600" />
          Хүлээж байна
          {waiting.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 text-xs">{waiting.length}</span>
          )}
        </h3>
        <span className={`px-1.5 py-0.5 rounded-md font-medium text-xs
                          ${freeCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
          Сул өрөө {freeCount}
        </span>
      </div>

      {waiting.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-6 rounded-xl border border-dashed border-gray-200">
          Дараалал хоосон байна
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {waiting.map(s => (
            <QueueRow
              key={s.id}
              session={s}
              isNext={s.id === nextId}
              readOnly={readOnly}
              onAdmit={setAdmitting}
              onCancel={handleCancel}
              onNoShow={handleNoShow}
              onArrived={handleArrived}
            />
          ))}
        </div>
      )}

      {admitting && (
        <AdmitModal
          session={admitting}
          waiting={waiting}
          rooms={rooms}
          onClose={() => setAdmitting(null)}
          onAssigned={onRefresh}
        />
      )}
    </div>
  )
}
