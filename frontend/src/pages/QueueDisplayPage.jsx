import { useState, useEffect } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import useBrandStore from '../store/useBrandStore'

/* Хүлээлгийн танхимын ТВ дэлгэц — нэвтрэлтгүй, 5 сек тутам шинэчлэгдэнэ.
   Хувийн мэдээлэл харуулахгүй: зөвхөн дарааллын дугаар, төрөл, өрөөний төлөв.
   Дараалал нь өрөөний төрөл бүрээр ТУСДАА, дугаар нь №001 хэлбэртэй. */

const qLabel = (n) => `№${String(n ?? 0).padStart(3, '0')}`

/* Үйлчлүүлэгчид ойлгомжтой, хялбаршуулсан төлөвүүд */
const ROOM_TV = {
  free:              { label: 'Сул',            tile: 'border-green-500 bg-green-500/10',  text: 'text-green-400'  },
  reserved:          { label: 'Захиалгатай',    tile: 'border-amber-400 bg-amber-400/10',  text: 'text-amber-300'  },
  in_use:            { label: 'Ашиглаж байна',  tile: 'border-blue-500 bg-blue-500/10',    text: 'text-blue-300'   },
  awaiting_cleaning: { label: 'Цэвэрлэж байна', tile: 'border-purple-500 bg-purple-500/10', text: 'text-purple-300' },
  cleaning:          { label: 'Цэвэрлэж байна', tile: 'border-purple-500 bg-purple-500/10', text: 'text-purple-300' },
}

export default function QueueDisplayPage() {
  const [board, setBoard] = useState({ types: [], rooms: [], waiting: [], now_serving: [] })
  const [clock, setClock] = useState(dayjs())
  const [offline, setOffline] = useState(false)
  const brandName = useBrandStore(s => s.brand_name)

  useEffect(() => {
    let alive = true
    const load = () => {
      // Interceptor-ийн toast/redirect-ээс зайлсхийж bare axios ашиглана
      axios.get('/api/public/queue-board')
        .then(r => { if (alive) { setBoard(r.data); setOffline(false) } })
        .catch(() => { if (alive) setOffline(true) })
    }
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setClock(dayjs()), 1000)
    return () => clearInterval(id)
  }, [])

  const rooms   = board.rooms || []
  const waiting = board.waiting || []
  // «Орно уу!» — өрөө нь оноогдсон, орохоо хүлээж буй үйлчлүүлэгчид
  const calling = (board.now_serving || []).filter(s => s.status === 'reserved')

  const freeCount = rooms.filter(r => r.status === 'free').length

  // Дараалал НЭГДСЭН — дугаарлалт өдөр бүр глобал
  // Ирээгүй хүн оочироо хадгалж эхэндээ үлдэнэ; ДАРААГИЙН нь
  // ирээгүйг алгасаад эхний хүлээж буй хүнд очно
  const shown  = waiting.slice(0, 15)
  const extra  = waiting.length - shown.length
  const nextId = waiting.find(w => !w.no_show)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Толгой ── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🚿</span>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-wide">ШҮРШҮҮРИЙН ДАРААЛАЛ</h1>
            <p className="text-gray-400 text-sm md:text-base">{brandName}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl md:text-5xl font-mono font-bold tabular-nums">
            {clock.format('HH:mm')}
            <span className="text-gray-500 text-2xl md:text-3xl">:{clock.format('ss')}</span>
          </div>
          <div className="text-gray-400 text-sm">{clock.format('YYYY.MM.DD')}</div>
        </div>
      </header>

      {offline && (
        <div className="bg-red-900/60 text-red-200 text-center py-2 text-sm">
          Холболт тасарлаа — дахин холбогдохыг оролдож байна...
        </div>
      )}

      {/* ── Орно уу! — дуудаж буй дугаарууд (хамгийн чухал мэдээлэл) ── */}
      {calling.length > 0 && (
        <section className="px-6 md:px-8 pt-5">
          <div className="flex flex-wrap gap-4">
            {calling.map((s, i) => (
              <div
                key={`${s.queue_no}-${i}`}
                className="flex-1 min-w-[300px] flex items-center justify-between gap-4 rounded-2xl
                           px-6 py-4 border-2 border-green-500 bg-green-500/10 animate-pulse"
              >
                <div className="min-w-0">
                  <div className="text-amber-400 text-sm md:text-lg font-bold tracking-widest">ООЧИР</div>
                  <div className="text-4xl md:text-6xl font-black tabular-nums text-amber-300">
                    {qLabel(s.queue_no)}
                  </div>
                  <div className="text-gray-400 text-base md:text-xl truncate">{s.type_name}</div>
                </div>
                <div className="text-4xl md:text-6xl text-green-400 flex-shrink-0">→</div>
                <div className="text-right flex-shrink-0">
                  <div className="text-gray-400 text-sm md:text-lg font-bold tracking-widest">ӨРӨӨ</div>
                  <div className="text-4xl md:text-6xl font-black">№{s.room_number}</div>
                  <div className="text-green-400 text-lg md:text-2xl font-bold">ОРНО УУ!</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Үндсэн хэсэг ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 md:p-8">

        {/* Өрөөний төлөв */}
        <section className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-300 tracking-wide">ӨРӨӨНИЙ ТӨЛӨВ</h2>
            <span className={`text-lg md:text-xl font-bold px-3 py-1 rounded-xl
                              ${freeCount > 0 ? 'bg-green-500/15 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
              Сул: {freeCount}
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-xl rounded-2xl border border-dashed border-gray-800">
              Өрөө бүртгэгдээгүй байна
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rooms.map(r => {
                const meta = ROOM_TV[r.status] || ROOM_TV.free
                return (
                  <div key={r.number}
                       className={`rounded-2xl border-2 px-4 py-3 ${meta.tile}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500 text-xs md:text-sm font-bold tracking-widest">ӨРӨӨ</span>
                      {r.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.color }} />}
                    </div>
                    <div className="text-2xl md:text-4xl font-black leading-tight">№{r.number}</div>
                    <div className="text-gray-400 text-sm md:text-base truncate">{r.type_name}</div>
                    <div className={`mt-1 font-bold text-base md:text-xl ${meta.text}`}>
                      {meta.label}
                      {r.status === 'in_use' && r.remaining_min != null && (
                        <span className="text-gray-400 font-medium text-sm md:text-base ml-2">
                          {r.remaining_min > 0 ? `~${r.remaining_min} мин` : 'дуусаж байна'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Тайлбар */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm md:text-base text-gray-400">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500" /> Сул — касс дээр төлбөрөө төлөөд орно</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" /> Ашиглаж байна</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500" /> Цэвэрлэж байна</span>
          </div>
        </section>

        {/* Хүлээж буй дараалал */}
        <section className="lg:col-span-2">
          <h2 className="text-xl md:text-2xl font-bold text-amber-400 mb-4 tracking-wide">
            ХҮЛЭЭЖ БАЙНА
            {waiting.length > 0 && (
              <span className="ml-2 text-base text-gray-500">({waiting.length})</span>
            )}
          </h2>

          {waiting.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center rounded-2xl border border-dashed border-gray-800 px-4">
              <span className="text-gray-500 text-xl">Дараалал хоосон байна</span>
              {freeCount > 0 && (
                <span className="text-green-400 text-base">Сул өрөө байна — шууд орох боломжтой</span>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2">
                {shown.map((w, i) => {
                  const isNext = nextId && w === nextId
                  return (
                    <div
                      key={`${w.queue_no}-${i}`}
                      className={`rounded-lg px-1 py-2.5 text-center border-2
                        ${isNext ? 'border-amber-400 bg-amber-400/10'
                          : w.no_show ? 'border-gray-800 bg-gray-900/40'
                          : 'border-gray-800 bg-gray-900/60'}`}
                    >
                      <div className={`text-2xl md:text-3xl font-black tabular-nums leading-tight
                                       ${isNext ? 'text-amber-300'
                                         : w.no_show ? 'text-gray-500' : 'text-gray-300'}`}>
                        {qLabel(w.queue_no)}
                      </div>
                      <div className="text-gray-600 text-[10px] md:text-xs truncate leading-tight">
                        {w.type_name}
                      </div>
                      {isNext
                        ? <div className="text-amber-400 text-[10px] md:text-xs font-bold leading-none">ДАРААГИЙН</div>
                        : w.no_show
                          ? <div className="text-gray-600 text-[10px] md:text-xs font-bold leading-none">ИРЭЭГҮЙ</div>
                          : null}
                    </div>
                  )
                })}
              </div>
              {extra > 0 && (
                <div className="text-gray-500 text-sm mt-2 text-right">
                  +{extra} хүн цааш хүлээж байна
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="text-center text-gray-600 text-sm py-3 border-t border-gray-800">
        Дарааллын дагуу орно уу · Асуулт байвал кассанд хандана уу
      </footer>
    </div>
  )
}
