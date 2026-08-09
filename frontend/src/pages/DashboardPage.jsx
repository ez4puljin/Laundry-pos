import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts'
import { Banknote, ArrowLeftRight, Smartphone, Search, AlertTriangle } from 'lucide-react'
import { reportsApi, machinesApi, shiftsApi } from '../api/client'
import dayjs from 'dayjs'

export default function DashboardPage() {
  const [summary, setSummary]     = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [topSvcs, setTopSvcs]     = useState([])
  const [cashierDays, setCashierDays] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const end   = dayjs().format('YYYY-MM-DD')
    const start = dayjs().subtract(6, 'day').format('YYYY-MM-DD')
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
    Promise.all([
      reportsApi.dashboard(),
      reportsApi.daily(start, end),
      reportsApi.topServices(start, end),
      reportsApi.cashierDays(monthStart, end).catch(() => ({ data: [] })),
    ]).then(([s, d, t, cd]) => {
      setSummary(s.data)
      setDailyData(d.data.map(r => ({
        ...r,
        date: dayjs(r.date).format('MM/DD'),
        revenue: Math.round(r.revenue || 0),  // нийт (тоймлохгүй)
        paid:    Math.round(r.paid || 0),
        unpaid:  Math.round(r.unpaid || 0),
      })))
      setTopSvcs(t.data)
      setCashierDays(cd.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          Тайлан уншиж байна...
        </div>
      </div>
    )
  }

  const PAYMENT_METHODS = [
    { label: 'Бэлэн мөнгө',      key: 'cash_revenue',     icon: Banknote,       color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Шилжүүлэг',        key: 'transfer_revenue', icon: ArrowLeftRight,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Карт',              key: 'card_revenue',     icon: Smartphone,     color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Төлбөр төлөөгүй',  key: 'unpaid_revenue',   icon: AlertTriangle,  color: 'text-red-600',    bg: 'bg-red-50'    },
  ]
  const paymentBreakdown = summary ? PAYMENT_METHODS : []

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3">
        <h1 className="font-bold text-base text-gray-800">📊 Тайлан</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {dayjs().format('YYYY оны MM сарын DD өдөр')}
        </p>
      </div>

      <div className="p-3 sm:p-6 space-y-4">
        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
            <KPICard
              icon="💰" label="Өнөөдрийн орлого"
              value={`${(summary.revenue_today || 0).toLocaleString()}₮`}
              sub={summary.unpaid_revenue > 0
                ? `Бодит: ${(summary.paid_revenue || 0).toLocaleString()}₮`
                : 'Бүгд төлөгдсөн'}
              color="blue"
            />
            {summary.unpaid_revenue > 0 && (
              <KPICard
                icon="⚠️" label="Төлбөр төлөөгүй"
                value={`${(summary.unpaid_revenue || 0).toLocaleString()}₮`}
                sub={`${summary.unpaid_count || 0} захиалга`}
                color="red"
              />
            )}
            {summary.late_total > 0 && (
              <KPICard
                icon="💰" label="Нөхөж авсан төлбөр"
                value={`+${(summary.late_total || 0).toLocaleString()}₮`}
                sub={`${summary.late_count || 0} өмнөх захиалга`}
                color="orange"
              />
            )}
            <KPICard
              icon="🧾" label="Захиалгын тоо"
              value={summary.order_count || 0}
              sub={`Дундаж: ${(summary.avg_order || 0).toLocaleString()}₮`}
              color="green"
            />
            <KPICard
              icon="👥" label="Нийт үйлчлүүлэгч"
              value={(summary.total_customers || 0).toLocaleString()}
              color="purple"
            />
            <KPICard
              icon="⚠️" label="Бага үлдэгдэл"
              value={summary.low_stock_count || 0}
              sub="Бараа материал"
              color={summary.low_stock_count > 0 ? 'red' : 'gray'}
            />
            {summary.deleted_count > 0 && (
              <KPICard
                icon="🗑️" label="Устгагдсан"
                value={summary.deleted_count}
                sub={`${(summary.deleted_total || 0).toLocaleString()}₮`}
                color="red"
              />
            )}
          </div>
        )}

        {/* Payment breakdown */}
        {summary && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
              <h2 className="font-bold text-gray-700">💳 Өнөөдрийн орлого — төлбөрийн хэлбэрээр</h2>
              <p className="text-xs text-gray-500">
                Нийт{' '}
                <b className="text-gray-800">{(summary.revenue_today || 0).toLocaleString()}₮</b>
                {' · '}бодит орлого{' '}
                <b className="text-green-600">{(summary.paid_revenue ?? summary.revenue_today ?? 0).toLocaleString()}₮</b>
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {paymentBreakdown.map(({ label, key, icon: Icon, color, bg }) => {
                const amount = summary[key] || 0
                return (
                  <div key={key} className={`flex flex-col items-center gap-2 rounded-xl px-3 py-3
                    ${amount > 0 ? bg : 'bg-gray-50'}`}>
                    <div className={`w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm`}>
                      <Icon className={`w-5 h-5 ${amount > 0 ? color : 'text-gray-300'}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium leading-tight">{label}</p>
                      <p className={`text-base font-bold leading-tight mt-0.5
                        ${amount > 0 ? color : 'text-gray-300'}`}>
                        {amount.toLocaleString()}₮
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Queue status */}
        {summary?.queue && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-700 mb-4">🔄 Одоогийн дараалал</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'pending',    label: 'Хүлээгдэж байна',       emoji: '🕐', color: 'yellow' },
                { key: 'processing', label: 'Үйлчилгээ хийгдэж байна', emoji: '⚙️', color: 'blue'   },
                { key: 'ready',      label: 'Бэлэн болсон',          emoji: '✅', color: 'green'  },
                { key: 'delivered',  label: 'Олгосон',                emoji: '📦', color: 'orange' },
              ].map(s => (
                <div key={s.key} className={`text-center p-4 rounded-xl
                  ${s.color === 'yellow' ? 'bg-yellow-50' :
                    s.color === 'blue'   ? 'bg-blue-50'   :
                    s.color === 'orange' ? 'bg-orange-50' :
                    'bg-green-50'}`}>
                  <p className="text-2xl mb-1">{s.emoji}</p>
                  <p className={`text-3xl font-bold
                    ${s.color === 'yellow' ? 'text-yellow-700' :
                      s.color === 'blue'   ? 'text-blue-700'   :
                      s.color === 'orange' ? 'text-orange-700' :
                      'text-green-700'}`}>
                    {summary.queue[s.key] || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="font-bold text-gray-700">📈 7 хоногийн орлого (₮)</h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Төлөгдсөн
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> Нөхөж авсан
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Төлөгдөөгүй
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyData} margin={{ top: 20, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={44}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}к` : v)}
                />
                <Tooltip
                  formatter={(v, name) => [
                    `${Number(v).toLocaleString()}₮`,
                    name === 'unpaid' ? 'Төлбөр төлөөгүй'
                      : name === 'late' ? 'Нөхөж авсан'
                      : 'Төлөгдсөн',
                  ]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="paid" stackId="rev" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" stackId="rev" fill="#fb923c" radius={[0, 0, 0, 0]} />
                <Bar dataKey="unpaid" stackId="rev" fill="#f87171" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    formatter={(v) => Number(v).toLocaleString()}
                    fontSize={10}
                    fill="#374151"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top services */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-700 mb-4">🏆 Эрэлттэй үйлчилгээ</h2>
            <div className="space-y-2">
              {topSvcs.slice(0, 6).map((s, i) => {
                const medals    = ['🥇', '🥈', '🥉']
                const pct       = Math.round((s.revenue / (topSvcs[0]?.revenue || 1)) * 100)
                const unitPrice = s.quantity > 0 ? Math.round(s.revenue / s.quantity) : 0
                const rankColors = [
                  'bg-yellow-100 text-yellow-700',
                  'bg-gray-100 text-gray-600',
                  'bg-orange-100 text-orange-600',
                ]
                return (
                  <div key={i} className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
                    {/* Name row */}
                    <div className="flex items-start gap-2 mb-2">
                      {i < 3 ? (
                        <span className="text-base leading-none mt-0.5 shrink-0">{medals[i]}</span>
                      ) : (
                        <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center
                                          justify-center shrink-0 mt-0.5 ${rankColors[i] || 'bg-blue-100 text-blue-600'}`}>
                          {i + 1}
                        </span>
                      )}
                      <p className="text-sm font-semibold text-gray-800 leading-snug flex-1">{s.name}</p>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-gray-100 mb-2 mx-1">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full border border-blue-100">
                        {s.quantity} ширхэг
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-800">
                          {s.revenue.toLocaleString()}₮
                        </span>
                        {unitPrice > 0 && (
                          <span className="text-xs text-gray-400 block leading-none mt-0.5">
                            {unitPrice.toLocaleString()}₮/нэг
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {topSvcs.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-6">Өгөгдөл байхгүй</p>
              )}
            </div>
          </div>
        </div>

        {/* Machine Report */}
        <MachineReport />

        {/* Cashier days report */}
        {cashierDays.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-700 mb-3">👷 Кассын ажилласан өдрүүд (энэ сар)</h2>
            <div className="space-y-2">
              {cashierDays.map(c => (
                <div key={c.user_id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.total_shifts} ээлж</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-lg text-blue-600">{c.total_days}</p>
                    <p className="text-xs text-gray-400">өдөр</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MachineReport() {
  const [start, setStart] = useState(dayjs().format('YYYY-MM-DD'))
  const [end, setEnd]     = useState(dayjs().format('YYYY-MM-DD'))
  const [data, setData]   = useState([])
  const [loading, setLoading] = useState(false)

  const MACHINE_TYPE_LABELS = { washer: '🧼 Угаалга', dryer: '🌬️ Хатаалга', shoe_washer: '👟 Пүүз' }

  const fetch = () => {
    setLoading(true)
    machinesApi.report(start, end)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const quickSet = (days) => {
    const e = dayjs().format('YYYY-MM-DD')
    const s = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD')
    setStart(s); setEnd(e)
    setLoading(true)
    machinesApi.report(s, e).then(r => setData(r.data)).finally(() => setLoading(false))
  }

  const totalServices = data.reduce((s, m) => s + m.total_services, 0)
  const totalMinutes  = data.reduce((s, m) => s + m.total_minutes, 0)
  const hours = Math.floor(totalMinutes / 60)
  const mins  = totalMinutes % 60

  return (
    <div className="bg-white rounded-2xl border p-5">
      <h3 className="font-bold text-gray-800 mb-3">🔧 Машинуудын тайлан</h3>

      {/* Date range + quick filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="date" value={start} onChange={e => setStart(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm" />
        <span className="text-gray-400">—</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={fetch}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          <Search className="w-3.5 h-3.5" /> Хайх
        </button>
        <div className="flex gap-1 ml-2">
          {[{ label: 'Өнөөдөр', d: 1 }, { label: '7 хоног', d: 7 }, { label: '30 хоног', d: 30 }].map(q => (
            <button key={q.d} onClick={() => quickSet(q.d)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-lg text-xs font-medium">
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{totalServices}</p>
          <p className="text-xs text-blue-600">Нийт үйлчилгээ</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{hours > 0 ? `${hours}ц ${mins}м` : `${mins}м`}</p>
          <p className="text-xs text-green-600">Нийт ажилласан</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">{data.filter(m => m.total_services > 0).length}/{data.length}</p>
          <p className="text-xs text-purple-600">Ашигласан машин</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-4">Уншиж байна...</p>
      ) : (
        <div className="space-y-2">
          {data.map(m => {
            const h = Math.floor(m.total_minutes / 60)
            const mn = m.total_minutes % 60
            return (
              <div key={m.machine_id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-sm">{MACHINE_TYPE_LABELS[m.machine_type] || m.machine_type}</span>
                <span className="font-semibold text-sm flex-1">{m.machine_name}</span>
                <span className="text-sm text-gray-600">{m.total_services} үйлч.</span>
                <span className="text-sm font-medium text-blue-600">
                  {h > 0 ? `${h}ц ${mn}м` : mn > 0 ? `${mn}м` : '—'}
                </span>
              </div>
            )
          })}
          {data.length === 0 && <p className="text-center text-gray-400 py-4">Өгөгдөл байхгүй</p>}
        </div>
      )}

    </div>
  )
}

function KPICard({ icon, label, value, sub, color }) {
  const colors = {
    blue:   'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    green:  'from-green-50 to-green-100 border-green-200 text-green-700',
    purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
    red:    'from-red-50 to-red-100 border-red-200 text-red-700',
    orange: 'from-orange-50 to-orange-100 border-orange-200 text-orange-700',
    gray:   'from-gray-50 to-gray-100 border-gray-200 text-gray-700',
  }
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 sm:p-4 ${colors[color] || colors.gray}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base sm:text-xl">{icon}</span>
        <p className="text-[10px] sm:text-xs font-medium opacity-75 leading-tight">{label}</p>
      </div>
      <p className="text-lg sm:text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] sm:text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}
