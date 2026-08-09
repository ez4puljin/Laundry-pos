import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { inventoryApi } from '../api/client'

export default function InventoryPage() {
  const [items, setItems]       = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm]         = useState({
    name: '', unit: 'кг', quantity: '', min_quantity: '1', cost_price: '', supplier: ''
  })

  const fetchItems = () => inventoryApi.list().then(r => setItems(r.data))

  useEffect(() => { fetchItems() }, [])

  const openCreate = () => {
    setEditItem(null)
    setForm({ name: '', unit: 'кг', quantity: '', min_quantity: '1', cost_price: '', supplier: '' })
    setShowForm(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      name: item.name, unit: item.unit, quantity: item.quantity,
      min_quantity: item.min_quantity, cost_price: item.cost_price,
      supplier: item.supplier || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    const data = {
      ...form,
      quantity:     parseFloat(form.quantity) || 0,
      min_quantity: parseFloat(form.min_quantity) || 1,
      cost_price:   parseFloat(form.cost_price) || 0,
    }
    try {
      if (editItem) {
        await inventoryApi.update(editItem.id, { quantity: data.quantity, min_quantity: data.min_quantity, cost_price: data.cost_price })
        toast.success('Шинэчлэгдлээ')
      } else {
        await inventoryApi.create(data)
        toast.success('Нэмэгдлээ')
      }
      setShowForm(false)
      fetchItems()
    } catch {}
  }

  const handleDelete = async (id) => {
    if (!confirm('Устгах уу?')) return
    await inventoryApi.remove(id)
    toast.success('Устгагдлаа')
    fetchItems()
  }

  const lowItems = items.filter(i => i.is_low)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-xl text-gray-800">📦 Бараа материал</h1>
          {lowItems.length > 0 && (
            <p className="text-sm text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
              {lowItems.length} бараа бага үлдсэн
            </p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2
                     rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Бараа нэмэх
        </button>
      </div>

      {/* Items table */}
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Бараа</th>
                <th className="text-right px-5 py-3">Үлдэгдэл</th>
                <th className="text-right px-5 py-3">Доод хэмжээ</th>
                <th className="text-right px-5 py-3">Үнэ</th>
                <th className="text-left px-5 py-3">Нийлүүлэгч</th>
                <th className="text-center px-5 py-3">Статус</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.unit}</p>
                  </td>
                  <td className={`px-5 py-4 text-right font-bold text-sm
                    ${item.is_low ? 'text-red-600' : 'text-gray-800'}`}>
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-5 py-4 text-right text-sm text-gray-500">
                    {item.min_quantity} {item.unit}
                  </td>
                  <td className="px-5 py-4 text-right text-sm text-gray-600">
                    {item.cost_price.toLocaleString()}₮
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {item.supplier || '—'}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {item.is_low ? (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700
                                       px-2.5 py-1 rounded-full text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Бага
                      </span>
                    ) : (
                      <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                        ✓ Хангалттай
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              Бараа материал бүртгэгдээгүй байна
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="font-bold text-lg mb-4">
              {editItem ? 'Бараа засах' : 'Шинэ бараа нэмэх'}
            </h3>
            <div className="space-y-3">
              {!editItem && (
                <>
                  <input
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                    placeholder="Барааны нэр *"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <select
                      className="border rounded-xl px-3 py-2.5 text-sm flex-1"
                      value={form.unit}
                      onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                    >
                      {['кг', 'литр', 'ширхэг', 'сав'].map(u => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      className="border rounded-xl px-3 py-2.5 text-sm flex-1"
                      placeholder="Нийлүүлэгч"
                      value={form.supplier}
                      onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Одоогийн үлдэгдэл</label>
                  <input
                    type="number" step="0.1"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                    placeholder="0"
                    value={form.quantity}
                    onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Доод хэмжээ</label>
                  <input
                    type="number" step="0.1"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm"
                    placeholder="1"
                    value={form.min_quantity}
                    onChange={e => setForm(p => ({ ...p, min_quantity: e.target.value }))}
                  />
                </div>
              </div>
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
                placeholder="Нэгжийн үнэ (₮)"
                value={form.cost_price}
                onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50"
              >
                Болих
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-blue-700"
              >
                {editItem ? 'Хадгалах' : 'Нэмэх'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
