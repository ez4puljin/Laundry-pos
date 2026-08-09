import { useState, useEffect, useCallback } from 'react'
import { Search, UserPlus, X, Star, Phone, MessageSquare, AlertTriangle, Eye, Package } from 'lucide-react'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { customersApi, ordersApi } from '../api/client'
import useStore from '../store/useStore'

export default function CustomerSearch() {
  const { customer, setCustomer, orderPhone, setOrderPhone } = useStore()
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [newForm, setNewForm]     = useState({ name: '', phone: '', email: '' })

  // ── Анхааруулгатай захиалга (төлбөр төлөлгүй явсан) ────
  const [flagged, setFlagged]         = useState([])
  const [showFlagged, setShowFlagged] = useState(false)

  useEffect(() => {
    if (!customer?.id) { setFlagged([]); setShowFlagged(false); return }
    let alive = true
    ordersApi.flagged({ customer_id: customer.id })
      .then(r => { if (alive) setFlagged(r.data || []) })
      .catch(() => { if (alive) setFlagged([]) })
    return () => { alive = false }
  }, [customer?.id])

  const hasWarning  = flagged.length > 0
  const warningDebt = flagged.reduce((s, o) => s + (o.is_paid ? 0 : o.total), 0)

  const handleSearch = useCallback(async (val) => {
    setQuery(val)
    if (val.length < 3) { setResults([]); return }
    setLoading(true)
    try {
      const res = await customersApi.search(val)
      setResults(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  const selectCustomer = (c) => {
    setCustomer(c)
    setQuery('')
    setResults([])
  }

  const removeCustomer = () => setCustomer(null)

  const createCustomer = async () => {
    if (!newForm.name.trim()) return toast.error('Нэр оруулна уу')
    if (!/^\d{8}$/.test(newForm.phone)) return toast.error('Утасны дугаар 8 оронтой тоо байх ёстой')
    try {
      const res = await customersApi.create(newForm)
      selectCustomer(res.data)
      setShowNew(false)
      setNewForm({ name: '', phone: '', email: '' })
      toast.success('Үйлчлүүлэгч бүртгэгдлээ')
    } catch {}
  }

  // ── Харилцагч сонгогдсон байвал ──────────────────────
  if (customer) {
    return (
      <div className={`rounded-xl p-3 border transition-colors
        ${hasWarning
          ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300 ring-1 ring-red-200'
          : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'}`}>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold
              ${hasWarning ? 'bg-red-600' : 'bg-blue-600'}`}>
              {customer.name[0]}
            </div>
            <div>
              <p className={`font-semibold text-sm flex items-center gap-1.5
                ${hasWarning ? 'text-red-700' : 'text-gray-800'}`}>
                {hasWarning && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                {customer.name}
              </p>
              <p className={`text-xs flex items-center gap-1 ${hasWarning ? 'text-red-500' : 'text-gray-500'}`}>
                <Phone className="w-3 h-3" />
                {customer.phone}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500">Оноо</p>
              <p className="font-bold text-yellow-600 flex items-center gap-1">
                <Star className="w-3 h-3" />
                {customer.points.toLocaleString()}
              </p>
            </div>
            <button onClick={removeCustomer} className="text-gray-400 hover:text-red-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Анхааруулга — жагсаалтад орсон захиалгыг шууд харах */}
        {hasWarning && (
          <button
            onClick={() => setShowFlagged(true)}
            className="mt-2.5 w-full flex items-center justify-between gap-2 bg-red-600 hover:bg-red-700
                       text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors
                       shadow-sm shadow-red-200"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Анхааруулгатай захиалга ({flagged.length})
                {warningDebt > 0 && ` · ${warningDebt.toLocaleString()}₮`}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0 bg-white/20 px-2 py-0.5 rounded-md">
              <Eye className="w-3 h-3" /> Харах
            </span>
          </button>
        )}

        {showFlagged && (
          <FlaggedOrdersModal
            customer={customer}
            orders={flagged}
            onClose={() => setShowFlagged(false)}
          />
        )}
      </div>
    )
  }

  // ── Харилцагч байхгүй ─────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Customer search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          className="w-full pl-9 pr-10 py-2 border rounded-xl text-sm focus:outline-none
                     focus:ring-2 focus:ring-blue-400"
          placeholder="Харилцагчийн дугаараар хайх..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
        />
        <button
          onClick={() => setShowNew(true)}
          className="absolute right-2 top-1.5 bg-blue-600 text-white rounded-lg p-1.5
                     hover:bg-blue-700 transition-colors"
          title="Шинэ үйлчлүүлэгч"
        >
          <UserPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <div className="mt-1 bg-white border rounded-xl shadow-lg overflow-hidden z-10">
          {results.map(c => {
            const warn = (c.warning_count || 0) > 0
            return (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className={`w-full flex items-center justify-between px-3 py-2.5
                           transition-colors border-b last:border-0
                           ${warn ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-blue-50'}`}
              >
                <div className="text-left min-w-0">
                  <p className={`text-sm font-medium flex items-center gap-1.5
                    ${warn ? 'text-red-700' : 'text-gray-800'}`}>
                    {warn && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    {c.name}
                  </p>
                  <p className={`text-xs ${warn ? 'text-red-400' : 'text-gray-400'}`}>{c.phone}</p>
                </div>
                <div className="text-right shrink-0">
                  {warn ? (
                    <>
                      <p className="text-xs text-red-600 font-bold">
                        ⚠️ {c.warning_count} захиалга
                      </p>
                      <p className="text-xs text-red-500 font-semibold">
                        {(c.warning_total || 0).toLocaleString()}₮
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-yellow-600 font-bold flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {c.points}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.total_spent.toLocaleString()}₮
                      </p>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-400 mt-1 pl-1">Хайж байна...</p>
      )}

      {/* SMS phone input — харилцагчгүй захиалгад */}
      <div className="relative">
        <MessageSquare className="absolute left-3 top-2.5 w-4 h-4 text-green-500" />
        <input
          className={`w-full pl-9 pr-16 py-2 border rounded-xl text-sm focus:outline-none
                     focus:ring-2 transition-colors
                     ${orderPhone.length === 8
                       ? 'border-green-400 focus:ring-green-400 bg-green-50'
                       : 'focus:ring-green-400'}`}
          placeholder="SMS дугаар (заавал биш, 8 оронтой)"
          value={orderPhone}
          maxLength={8}
          inputMode="numeric"
          onChange={e => setOrderPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
        <span className={`absolute right-3 top-2.5 text-xs font-medium
          ${orderPhone.length === 8 ? 'text-green-500' : 'text-gray-400'}`}>
          {orderPhone.length > 0 ? `${orderPhone.length}/8` : ''}
          {orderPhone.length === 8 && ' ✓'}
        </span>
      </div>

      {/* New customer modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="font-bold text-lg mb-4 text-gray-800">Шинэ үйлчлүүлэгч</h3>
            <div className="space-y-3">
              <input
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Нэр *"
                value={newForm.name}
                onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
              />
              <div className="relative">
                <input
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2
                    ${newForm.phone.length === 8 ? 'border-green-400 focus:ring-green-400' : 'focus:ring-blue-400'}`}
                  placeholder="Утасны дугаар * (8 оронтой)"
                  value={newForm.phone}
                  maxLength={8}
                  inputMode="numeric"
                  onChange={e => setNewForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                />
                <span className={`absolute right-3 top-2.5 text-xs font-medium
                  ${newForm.phone.length === 8 ? 'text-green-500' : 'text-gray-400'}`}>
                  {newForm.phone.length}/8
                </span>
              </div>
              <input
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="И-мэйл (заавал биш)"
                value={newForm.email}
                onChange={e => setNewForm(p => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium
                           hover:bg-gray-50 transition-colors"
              >
                Болих
              </button>
              <button
                onClick={createCustomer}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold
                           hover:bg-blue-700 transition-colors"
              >
                Бүртгэх
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Анхааруулгын жагсаалтад орсон захиалгууд (POS дээр шууд харах) ── */
function FlaggedOrdersModal({ customer, orders, onClose }) {
  const debt = orders.reduce((s, o) => s + (o.is_paid ? 0 : o.total), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-4 text-white shrink-0 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Анхааруулгатай захиалга
              </h3>
              <p className="text-xs text-red-100 mt-0.5 truncate">
                {customer.name} · {customer.phone}
              </p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black tracking-tight">{debt.toLocaleString()}₮</span>
            <span className="text-xs text-red-100">төлөгдөөгүй үлдэгдэл</span>
          </div>
        </div>

        {/* Orders */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {orders.map(o => (
            <div key={o.id} className="rounded-xl border border-red-200 bg-red-50/50 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-red-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-black text-red-600 text-sm">
                    #{o.order_number.split('-').pop()}
                  </span>
                  <span className="text-xs text-gray-400">
                    {dayjs(o.created_at).format('YYYY/MM/DD HH:mm')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {o.is_paid ? (
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                      Төлөгдсөн
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      Төлөгдөөгүй
                    </span>
                  )}
                  <span className="font-bold text-gray-800 text-sm">{o.total.toLocaleString()}₮</span>
                </div>
              </div>

              <div className="px-3 py-2 space-y-1">
                {o.items.map((item, i) => {
                  const isProduct = item.item_type === 'product'
                  const name = item.item_name || item.service?.name || item.product?.name || '—'
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {isProduct
                        ? <Package className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
                      <span className="flex-1 text-gray-700 truncate">{name}</span>
                      <span className="text-gray-400">×{item.quantity}</span>
                      <span className="text-gray-600 font-medium">
                        {item.total_price.toLocaleString()}₮
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="px-3 pb-2 space-y-1">
                {o.flagged_reason && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200
                                rounded-lg px-2 py-1">
                    📝 {o.flagged_reason}
                  </p>
                )}
                <p className="text-[10px] text-gray-400">
                  ⚠️ {o.flagged_at ? dayjs(o.flagged_at).format('YYYY/MM/DD HH:mm') : '—'}
                  {o.flagged_by && ` · ${o.flagged_by}`}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t shrink-0">
          <p className="text-[11px] text-gray-400 text-center">
            Төлбөр авах / жагсаалтаас хасах үйлдлийг <b>Анхааруулга</b> цэснээс хийнэ
            (хасах эрх зөвхөн админд).
          </p>
        </div>
      </div>
    </div>
  )
}
