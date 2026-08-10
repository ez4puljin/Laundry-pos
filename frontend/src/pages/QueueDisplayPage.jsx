import { useState, useEffect } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'

/* Хүлээлгийн танхимын ТВ дэлгэц — нэвтрэлтгүй, 5 сек тутам шинэчлэгдэнэ.
   Хувийн мэдээлэл харуулахгүй: зөвхөн дарааллын дугаар, төрөл, өрөөний дугаар.
   Дараалал нь өрөөний төрөл бүрээр ТУСДАА, дугаар нь 3 оронтой (001). */

const qLabel = (n) => String(n ?? 0).padStart(3, '0')

export default function QueueDisplayPage() {
  const [board, setBoard] = useState({ types: [], waiting: [], now_serving: [] })
  const [clock, setClock] = useState(dayjs())
  const [offline, setOffline] = useState(false)

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

  const serving = board.now_serving || []
  const waiting = board.waiting || []

  // Төрөл бүрийн дараалал тусдаа багана
  const groups = (board.types || []).length
    ? board.types.map(t => ({ ...t, items: waiting.filter(w => w.room_type_id === t.id) }))
    : waiting.reduce((acc, s) => {
        let g = acc.find(x => x.id === s.room_type_id)
        if (!g) { g = { id: s.room_type_id, name: s.type_name, items: [] }; acc.push(g) }
        g.items.push(s)
        return acc
      }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🚿</span>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-wide">ШҮРШҮҮРИЙН ДАРААЛАЛ</h1>
            <p className="text-gray-400 text-sm md:text-base">Цэмбий Laundry</p>
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

      {/* Body */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 md:p-8">

        {/* ── Одоо орж байна ── */}
        <section className="lg:col-span-3 flex flex-col">
          <h2 className="text-xl md:text-2xl font-bold text-green-400 mb-4 tracking-wide">
            ОДОО ОРЖ БАЙНА
          </h2>
          {serving.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-xl rounded-2xl border border-dashed border-gray-800">
              Хоосон байна
            </div>
          ) : (
            <div className="space-y-3">
              {serving.map((s, i) => {
                const isCalling = s.status === 'reserved'
                return (
                  <div
                    key={`${s.queue_no}-${i}`}
                    className={`flex items-center justify-between gap-4 rounded-2xl px-6 py-4 border-2
                                ${isCalling
                                  ? 'border-green-500 bg-green-500/10 animate-pulse'
                                  : 'border-gray-800 bg-gray-900/60 opacity-70'}`}
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <span className={`text-4xl md:text-6xl font-black tabular-nums
                                        ${isCalling ? 'text-green-400' : 'text-gray-400'}`}>
                        {qLabel(s.queue_no)}
                      </span>
                      <span className="text-gray-400 text-lg md:text-2xl truncate">{s.type_name}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-3xl md:text-5xl font-black">
                        Өрөө №{s.room_number}
                      </div>
                      <div className={`text-sm md:text-lg font-medium ${isCalling ? 'text-green-400' : 'text-gray-500'}`}>
                        {isCalling ? 'Орно уу!' : 'Ашиглаж байна'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Хүлээж байна ── */}
        <section className="lg:col-span-2 flex flex-col">
          <h2 className="text-xl md:text-2xl font-bold text-amber-400 mb-4 tracking-wide">
            ХҮЛЭЭЖ БАЙНА
            {waiting.length > 0 && (
              <span className="ml-2 text-base text-gray-500">({waiting.length})</span>
            )}
          </h2>
          {groups.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-xl rounded-2xl border border-dashed border-gray-800">
              Дараалал хоосон байна
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(g => (
                <div key={g.id}>
                  <div className="flex items-center gap-2 mb-2">
                    {g.color && <span className="w-3 h-3 rounded-full" style={{ background: g.color }} />}
                    <span className="text-lg md:text-xl font-bold text-gray-300">{g.name}</span>
                    <span className="text-gray-600 text-sm">({g.items.length})</span>
                  </div>
                  {g.items.length === 0 ? (
                    <div className="text-gray-700 text-base rounded-xl border border-dashed border-gray-800 py-3 text-center">
                      Хоосон
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {g.items.map((w, i) => (
                        <div
                          key={`${g.id}-${w.queue_no}-${i}`}
                          className={`rounded-xl px-2 py-3 text-center border-2
                                      ${i === 0 ? 'border-amber-400 bg-amber-400/10' : 'border-gray-800 bg-gray-900/60'}`}
                        >
                          <div className={`text-3xl md:text-4xl font-black tabular-nums
                                           ${i === 0 ? 'text-amber-300' : 'text-gray-300'}`}>
                            {qLabel(w.queue_no)}
                          </div>
                          {i === 0 && <div className="text-amber-400 text-[11px] font-bold mt-0.5">ДАРААГИЙН</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="text-center text-gray-600 text-sm py-3 border-t border-gray-800">
        Дарааллын дагуу орно уу · Асуулт байвал кассанд хандана уу
      </footer>
    </div>
  )
}
