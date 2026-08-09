import { useState, useEffect } from 'react'
import { Search, Star, Phone, ChevronRight, X, Pencil, Trash2, Save } from 'lucide-react'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { customersApi, machinesApi } from '../api/client'
import useAuthStore from '../store/useAuthStore'

const STATUS_LABELS = {
  pending: 'Хүлээгдэж байна', washing: 'Угааж байна',
  ironing: 'Индүүдэж байна',  ready: 'Бэлэн', delivered: 'Олгосон'
}

export default function CustomersPage() {
  const isAdmin = useAuthStore(s => s.isAdmin)()
  const [customers, setCustomers]     = useState([])
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)
  const [orders, setOrders]           = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [expandedId, setExpandedId]   = useState(null)
  const [usagesMap, setUsagesMap]     = useState({})
  const [editing, setEditing]         = useState(false)
  const [editForm, setEditForm]       = useState({ name: '', phone: '', email: '' })

  const toggleOrder = async (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!usagesMap[id]) {
      try {
        const r = await machinesApi.usagesByOrder(id)
        setUsagesMap(prev => ({ ...prev, [id]: r.data || [] }))
      } catch { setUsagesMap(prev => ({ ...prev, [id]: [] })) }
    }
  }

  const fetchAllCustomers = () => {
    customersApi.list({ limit: 500 }).then(r => setCustomers(r.data))
  }

  useEffect(() => {
    if (search.length >= 1) {
      customersApi.search(search).then(r => setCustomers(r.data))
    } else {
      fetchAllCustomers()
    }
  }, [search])

  useEffect(() => { fetchAllCustomers() }, [])

  const selectCustomer = async (c) => {
    setSelected(c)
    setEditing(false)
    setLoadingOrders(true)
    try {
      const res = await customersApi.orders(c.id)
      setOrders(res.data)
    } finally {
      setLoadingOrders(false)
    }
  }

  const startEdit = () => {
    setEditForm({ name: selected.name, phone: selected.phone, email: selected.email || '' })
    setEditing(true)
  }

  const saveEdit = async () => {
    try {
      const res = await customersApi.update(selected.id, editForm)
      const updated = res.data
      setSelected(updated)
      setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditing(false)
      toast.success('Мэдээлэл хадгалагдлаа')
    } catch { /* error handled by interceptor */ }
  }

  const deleteCustomer = async () => {
    if (!confirm('Энэ үйлчлүүлэгчийг устгах уу?')) return
    try {
      await customersApi.remove(selected.id)
      setCustomers(prev => prev.filter(c => c.id !== selected.id))
      setSelected(null)
      setOrders([])
      toast.success('Үйлчлүүлэгч устгагдлаа')
    } catch { /* error handled by interceptor */ }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT — Customer list: mobile дээр customer сонгосон үед нуугдана */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-gray-200 bg-white shrink-0`}>
        <div className="p-4 border-b">
          <h1 className="font-bold text-lg text-gray-800 mb-3">👥 Үйлчлүүлэгчид</h1>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Утас, нэрээр хайх..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {customers.map(c => (
            <button
              key={c.id}
              onClick={() => selectCustomer(c)}
              className={`w-full flex items-center px-4 py-3 border-b hover:bg-blue-50
                          transition-colors text-left
                          ${selected?.id === c.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600
                              flex items-center justify-center text-white font-bold text-sm mr-3 flex-shrink-0">
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {c.phone}
                </p>
              </div>
              <div className="text-right ml-2">
                <p className="text-xs text-yellow-600 font-bold flex items-center gap-0.5 justify-end">
                  <Star className="w-3 h-3" />
                  {c.points}
                </p>
                <p className="text-xs text-gray-400">{(c.total_spent / 1000).toFixed(0)}K₮</p>
              </div>
            </button>
          ))}
          {customers.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-16">
              Үйлчлүүлэгч олдсонгүй
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Customer detail: mobile дээр full width */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
          {/* Profile header */}
          <div className="bg-white border-b px-4 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {/* Mobile back button */}
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden text-blue-600 font-semibold text-sm mr-1"
                >
                  ← Буцах
                </button>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700
                                flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0">
                  {selected.name[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">{selected.name}</h2>
                  <p className="text-gray-500 flex items-center gap-1 mt-0.5 text-sm">
                    <Phone className="w-3.5 h-3.5" />
                    {selected.phone}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Бүртгэлтэй: {dayjs(selected.created_at).format('YYYY-MM-DD')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && !editing && (
                  <>
                    <button onClick={startEdit}
                      className="text-blue-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-blue-50"
                      title="Засах">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {orders.length === 0 && (
                      <button onClick={deleteCustomer}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50"
                        title="Устгах">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setSelected(null); setEditing(false) }}
                  className="hidden md:block text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Edit form */}
            {editing && (
              <div className="mt-3 space-y-2 bg-blue-50 rounded-xl p-3">
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Нэр"
                  value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Утас"
                  value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="И-мэйл"
                  value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={saveEdit}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Save className="w-3.5 h-3.5" /> Хадгалах
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
                    Болих
                  </button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <StatCard label="Нийт зарцуулсан" value={`${selected.total_spent.toLocaleString()}₮`} color="blue" />
              <StatCard label="Лояалти оноо"    value={selected.points.toLocaleString()} color="yellow" emoji="⭐" />
              <StatCard label="Захиалгын тоо"   value={orders.length} color="green" />
            </div>
          </div>

          {/* Order history */}
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="font-bold text-gray-700 mb-3">📋 Захиалгын түүх</h3>
            {loadingOrders ? (
              <p className="text-gray-400 text-sm">Уншиж байна...</p>
            ) : orders.length === 0 ? (
              <p className="text-gray-400 text-sm">Захиалга байхгүй</p>
            ) : (
              <div className="space-y-2.5">
                {orders.map(o => {
                  const isOpen = expandedId === o.id
                  const usages = usagesMap[o.id] || []
                  return (
                    <div key={o.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Header — tap to expand */}
                      <button onClick={() => toggleOrder(o.id)}
                        className="w-full text-left p-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-blue-600 text-sm">#{o.order_number?.split('-').pop()}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                              ${o.status === 'delivered' || o.status === 'archived' ? 'bg-green-100 text-green-700'
                              : o.status === 'ready' ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'}`}>
                              {STATUS_LABELS[o.status] || o.status}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-gray-800">{o.total.toLocaleString()}₮</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                          <span>{dayjs(o.created_at).format('MM/DD HH:mm')}</span>
                          <span>👤 {o.cashier_name}</span>
                          <span>{o.items.length} зүйл</span>
                          <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="border-t px-3.5 pb-3.5 pt-2 space-y-2">
                          {/* Items */}
                          {o.items.map((item, i) => {
                            const isProduct = item.item_type === 'product'
                            const name = item.item_name || item.service?.name || item.product?.name || '—'
                            const usage = usages.find(u => u.order_item_id === item.id)
                            return (
                              <div key={i} className="flex items-start justify-between text-xs">
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isProduct ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                                    <span className="font-medium text-gray-700">{name}</span>
                                    <span className="text-gray-400">×{item.quantity}</span>
                                    {isProduct && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded">бараа</span>}
                                  </div>
                                  {usage && (
                                    <div className="ml-3 mt-0.5 text-[10px] text-gray-400">
                                      🔧 {usage.service_name || ''} · Эхэлсэн: {dayjs(usage.started_at).format('HH:mm')}
                                      {usage.ended_at && ` · Дууссан: ${dayjs(usage.ended_at).format('HH:mm')}`}
                                    </div>
                                  )}
                                </div>
                                <span className="text-gray-600 font-medium shrink-0">{item.total_price.toLocaleString()}₮</span>
                              </div>
                            )
                          })}

                          {/* Notes */}
                          {o.notes && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">📝</span>
                              <span>{o.notes}</span>
                            </div>
                          )}

                          {/* Payment info */}
                          <div className="border-t pt-2 mt-2 flex items-center justify-between text-[11px] text-gray-400">
                            <span>Төлбөр: {o.payment_method === 'cash' ? 'Бэлэн' : o.payment_method === 'transfer' ? 'Шилжүүлэг' : o.payment_method === 'card' ? 'Карт' : o.payment_method}</span>
                            {o.points_earned > 0 && <span className="text-yellow-600">+{o.points_earned} оноо</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="text-5xl mb-3">👈</p>
            <p>Үйлчлүүлэгч сонгоно уу</p>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, emoji }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    green:  'bg-green-50 text-green-700 border-green-200',
  }
  return (
    <div className={`rounded-xl border p-3 text-center ${colors[color]}`}>
      <p className="text-lg font-bold">{emoji} {value}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  )
}
