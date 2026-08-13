import { useState, useEffect, useCallback } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, PackagePlus, BookOpen, Scale, Truck,
  Landmark, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, X, ArrowDownCircle,
  ArrowUpCircle, HandCoins, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import {
  financeApi, inventoryApi, customersApi, usersApi, categoriesApi,
} from '../api/client'
import { Modal, Field } from './ManagePage'

/* ── Туслахууд ────────────────────────────────────────── */
const fmt = (n) => `${Math.round(n ?? 0).toLocaleString()}₮`
const today = () => dayjs().format('YYYY-MM-DD')
const monthStart = () => dayjs().startOf('month').format('YYYY-MM-DD')
const fmtDate = (s) => (s ? dayjs(s).format('MM/DD') : '—')

const EXPENSE_CATEGORIES = ['Цалин', 'Түрээс', 'Цахилгаан, ус', 'Сэлбэг засвар', 'Тээвэр', 'Маркетинг', 'Татвар хураамж', 'Бусад']
const INCOME_CATEGORIES  = ['Бусад орлого', 'Хөрөнгө оруулалт', 'Эргэн төлөлт']

const PARTNER_LABELS = { employee: 'Ажилтан', customer: 'Харилцагч', supplier: 'Нийлүүлэгч', other: 'Бусад' }


/* ── Харилцагч сонгогч ────────────────────────────────── */
function PartnerPicker({ value, onChange, suppliers, employees }) {
  const [custQuery, setCustQuery] = useState('')
  const [custResults, setCustResults] = useState([])

  useEffect(() => {
    if (value.type !== 'customer' || custQuery.trim().length < 2) { setCustResults([]); return }
    const t = setTimeout(() => {
      customersApi.search(custQuery.trim())
        .then(r => setCustResults((r.data || []).slice(0, 5)))
        .catch(() => setCustResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [custQuery, value.type])

  const setType = (type) => {
    onChange({ type, id: null, name: '' })
    setCustQuery('')
  }

  return (
    <div className="space-y-2">
      <select className="input" value={value.type}
        onChange={e => setType(e.target.value)}>
        <option value="">Харилцагчгүй</option>
        <option value="employee">Ажилтан</option>
        <option value="customer">Харилцагч (үйлчлүүлэгч)</option>
        <option value="supplier">Нийлүүлэгч</option>
        <option value="other">Бусад (нэрээр)</option>
      </select>

      {value.type === 'employee' && (
        <select className="input" value={value.id || ''}
          onChange={e => {
            const u = employees.find(x => x.id === parseInt(e.target.value))
            onChange({ type: 'employee', id: u?.id || null, name: u?.full_name || '' })
          }}>
          <option value="">-- Ажилтан сонгох --</option>
          {employees.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      )}

      {value.type === 'supplier' && (
        <select className="input" value={value.id || ''}
          onChange={e => {
            const s = suppliers.find(x => x.id === parseInt(e.target.value))
            onChange({ type: 'supplier', id: s?.id || null, name: s?.name || '' })
          }}>
          <option value="">-- Нийлүүлэгч сонгох --</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {value.type === 'customer' && (
        value.id ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-sm">
            <span className="font-medium text-blue-800">{value.name}</span>
            <button type="button" onClick={() => onChange({ type: 'customer', id: null, name: '' })}
              className="p-1 rounded hover:bg-blue-100"><X size={14} /></button>
          </div>
        ) : (
          <div>
            <input className="input" placeholder="Нэр эсвэл утсаар хайх..."
              value={custQuery} onChange={e => setCustQuery(e.target.value)} />
            {custResults.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-xl divide-y overflow-hidden">
                {custResults.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { onChange({ type: 'customer', id: c.id, name: c.name }); setCustResults([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {c.name} <span className="text-gray-400">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {value.type === 'other' && (
        <input className="input" placeholder="Нэр *" value={value.name}
          onChange={e => onChange({ type: 'other', id: null, name: e.target.value })} />
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Тайлан
═══════════════════════════════════════════════════════ */
function ReportTab() {
  const [start, setStart] = useState(monthStart())
  const [end, setEnd]     = useState(today())
  const [data, setData]   = useState(null)

  const fetch = useCallback(() => {
    financeApi.summary({ start, end }).then(r => setData(r.data)).catch(() => {})
  }, [start, end])

  useEffect(() => { fetch() }, [fetch])

  if (!data) return <div className="p-8 text-center text-sm text-gray-400">Уншиж байна...</div>

  const Card = ({ label, value, sub, cls = 'text-gray-800' }) => (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div className="p-4 space-y-5">
      {/* Хугацааны шүүлт */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Эхлэх</label>
          <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дуусах</label>
          <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <button onClick={fetch}
          className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-600
                     hover:bg-gray-50 inline-flex items-center gap-1.5">
          <RefreshCw size={14} /> Шинэчлэх
        </button>
      </div>

      {/* Гол үзүүлэлтүүд */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Нийт орлого" value={fmt(data.total_income)}
              sub={`POS ${fmt(data.pos.total)} + бусад ${fmt(data.other_income)}`} cls="text-green-600" />
        <Card label="Нийт зарлага" value={fmt(data.total_expense)} cls="text-red-600" />
        <Card label="Цэвэр дүн" value={fmt(data.net)}
              cls={data.net >= 0 ? 'text-green-700' : 'text-red-700'} />
        <Card label="Худалдан авалт" value={fmt(data.purchases_total)}
              sub={data.purchases_credit > 0 ? `үүнээс өглөгөөр ${fmt(data.purchases_credit)}` : null} />
      </div>

      {/* Дансдын үлдэгдэл */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-2">Дансдын үлдэгдэл</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.accounts.map(a => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Landmark size={13} /> {a.name}
              </div>
              <div className={`text-lg font-bold mt-1 ${a.balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                {fmt(a.balance)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Үлдэгдэлд POS-ийн орлого автоматаар орсон (данс бүрийн POS холболтын дагуу)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* POS задаргаа */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">POS борлуулалт (сонгосон хугацаанд)</h3>
          <div className="space-y-2 text-sm">
            {[['Бэлэн мөнгө', data.pos.cash], ['Шилжүүлэг', data.pos.transfer],
              ['Карт', data.pos.card], ['Оноогоор', data.pos.points]].map(([l, v]) => (
              <div key={l} className="flex justify-between">
                <span className="text-gray-500">{l}</span>
                <span className="font-medium">{fmt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>Нийт</span><span>{fmt(data.pos.total)}</span>
            </div>
          </div>
        </div>

        {/* Зардал ангиллаар */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Зарлага ангиллаар</h3>
          {data.expense_by_category.length === 0 ? (
            <p className="text-sm text-gray-400">Зарлага бүртгэгдээгүй</p>
          ) : (
            <div className="space-y-2 text-sm">
              {data.expense_by_category.map(c => (
                <div key={c.category} className="flex justify-between">
                  <span className="text-gray-500">{c.category}</span>
                  <span className="font-medium text-red-600">{fmt(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Авлага / Өглөг */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card label="Нээлттэй авлага (бидэнд өртэй)" value={fmt(data.receivable_open)} cls="text-cyan-700" />
        <Card label="Нээлттэй өглөг (бид өртэй)" value={fmt(data.payable_open)} cls="text-orange-700" />
        <Card label="Төлөгдөөгүй POS захиалга" value={fmt(data.unpaid_orders)}
              sub="Анхааруулга хуудаснаас удирдана" cls="text-red-600" />
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Худалдан авалт
═══════════════════════════════════════════════════════ */
const EMPTY_LINE = { product_id: '', location: '', quantity: '', unit_cost: '' }

function PurchasesTab({ suppliers, accounts, onDataChange }) {
  const [rows, setRows]         = useState([])
  const [products, setProducts] = useState([])
  const [showModal, setShow]    = useState(false)
  const [form, setForm] = useState({
    doc_date: today(), supplier_id: '', description: '',
    payment_type: 'paid', account_id: '', lines: [{ ...EMPTY_LINE }],
  })

  const fetch = () => financeApi.purchases().then(r => setRows(r.data)).catch(() => {})
  useEffect(() => {
    fetch()
    inventoryApi.list().then(r => setProducts(r.data || [])).catch(() => {})
  }, [])

  const openCreate = () => {
    if (products.length === 0) return toast.error('Эхлээд Удирдлага → Бараа цэснээс бараа бүртгэнэ үү')
    setForm({
      doc_date: today(), supplier_id: '', description: '',
      payment_type: 'paid', account_id: String(accounts[0]?.id || ''),
      lines: [{ ...EMPTY_LINE }],
    })
    setShow(true)
  }

  const setLine = (i, patch) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) }))

  const lineTotal = (l) => (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0)
  const grandTotal = form.lines.reduce((s, l) => s + lineTotal(l), 0)

  const handleSubmit = async () => {
    const items = form.lines
      .filter(l => l.product_id && parseFloat(l.quantity) > 0)
      .map(l => ({
        product_id: parseInt(l.product_id),
        location: l.location.trim() || null,
        quantity: parseFloat(l.quantity),
        unit_cost: parseFloat(l.unit_cost) || 0,
      }))
    if (items.length === 0) return toast.error('Бараа, тоо хэмжээ оруулна уу')
    if (form.payment_type === 'paid' && !form.account_id) return toast.error('Данс сонгоно уу')
    if (form.payment_type === 'credit' && !form.supplier_id) return toast.error('Өглөгөөр авахад нийлүүлэгч заавал сонгоно')
    try {
      await financeApi.createPurchase({
        doc_date: form.doc_date,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        description: form.description.trim() || null,
        payment_type: form.payment_type,
        account_id: form.payment_type === 'paid' ? parseInt(form.account_id) : null,
        items,
      })
      toast.success('Худалдан авалт бүртгэгдлээ')
      setShow(false); fetch(); onDataChange?.()
    } catch { /* interceptor toast */ }
  }

  const handleDelete = async (row) => {
    if (!confirm(`${row.doc_number} худалдан авалтыг устгах уу?\nБарааны үлдэгдэл буцаж хасагдана.`)) return
    try {
      await financeApi.removePurchase(row.id)
      toast.success('Устгагдлаа'); fetch(); onDataChange?.()
    } catch {}
  }

  const accName = (id) => accounts.find(a => a.id === id)?.name || 'Данс'

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800">Бараа материалын орлого</h2>
          <p className="text-xs text-gray-500">Худалдан авалт бүртгэхэд үлдэгдэл нэмэгдэж, өртөг шинэчлэгдэнэ</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Орлого нэмэх
        </button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Худалдан авалт бүртгэгдээгүй байна</div>
        )}
        {rows.map(row => (
          <div key={row.id} className="p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{row.doc_number}</span>
                  <span className="text-xs text-gray-400">{dayjs(row.doc_date).format('YYYY/MM/DD')}</span>
                  {row.payment_type === 'credit' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">Өглөгөөр</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{accName(row.account_id)}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">
                  {row.supplier_name && <span className="font-medium">{row.supplier_name} · </span>}
                  {row.items.map(i => `${i.item_name} ×${i.quantity}`).join(', ')}
                  {row.description && <span> · {row.description}</span>}
                </div>
              </div>
              <span className="font-bold text-gray-800 whitespace-nowrap">{fmt(row.total)}</span>
              <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Устгах">
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="Бараа материалын орлого" onClose={() => setShow(false)}
               onSubmit={handleSubmit} submitLabel="Хадгалах">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо *">
              <input type="date" className="input" value={form.doc_date}
                onChange={e => setForm({ ...form, doc_date: e.target.value })} />
            </Field>
            <Field label="Нийлүүлэгч">
              <select className="input" value={form.supplier_id}
                onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">Сонгохгүй</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Гүйлгээний утга">
            <input className="input" placeholder="Ж: саван, угаалгын нунтаг авав"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Төлбөр *">
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, payment_type: 'paid' })}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.payment_type === 'paid' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                Данснаас төлсөн
              </button>
              <button type="button" onClick={() => setForm({ ...form, payment_type: 'credit' })}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.payment_type === 'credit' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-500'}`}>
                Өглөгөөр (дараа төлнө)
              </button>
            </div>
          </Field>
          {form.payment_type === 'paid' && (
            <Field label="Данс *">
              <select className="input" value={form.account_id}
                onChange={e => setForm({ ...form, account_id: e.target.value })}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}

          <Field label="Бараа материал *">
            <div className="space-y-2">
              {form.lines.map((l, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-2 space-y-2">
                  <div className="flex gap-2">
                    <select className="input flex-1" value={l.product_id}
                      onChange={e => setLine(i, { product_id: e.target.value })}>
                      <option value="">-- Бараа сонгох --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (үлд: {p.quantity}{p.unit})</option>
                      ))}
                    </select>
                    {form.lines.length > 1 && (
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))}
                        className="p-2 rounded-lg hover:bg-red-50 shrink-0">
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input" type="number" placeholder="Тоо *" value={l.quantity}
                      onChange={e => setLine(i, { quantity: e.target.value })} />
                    <input className="input" type="number" placeholder="Нэгж үнэ *" value={l.unit_cost}
                      onChange={e => setLine(i, { unit_cost: e.target.value })} />
                    <input className="input" placeholder="Байршил" value={l.location}
                      onChange={e => setLine(i, { location: e.target.value })} />
                  </div>
                  {lineTotal(l) > 0 && (
                    <div className="text-right text-xs text-gray-500">= {fmt(lineTotal(l))}</div>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }))}
                className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50">
                + Мөр нэмэх
              </button>
            </div>
          </Field>
          <div className="flex justify-between font-bold text-gray-800 border-t pt-2">
            <span>Нийт дүн</span><span>{fmt(grandTotal)}</span>
          </div>
        </Modal>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Кассын журнал
═══════════════════════════════════════════════════════ */
function JournalTab({ accounts, suppliers, employees, onDataChange }) {
  const [rows, setRows]       = useState([])
  const [dirFilter, setDir]   = useState('')
  const [accFilter, setAcc]   = useState('')
  const [showModal, setShow]  = useState(false)
  const [form, setForm] = useState({
    direction: 'expense', doc_date: today(), account_id: '', category: 'Цалин',
    partner: { type: '', id: null, name: '' }, description: '', amount: '',
  })

  const fetch = useCallback(() => {
    const params = {}
    if (dirFilter) params.direction = dirFilter
    if (accFilter) params.account_id = accFilter
    financeApi.transactions(params).then(r => setRows(r.data)).catch(() => {})
  }, [dirFilter, accFilter])

  useEffect(() => { fetch() }, [fetch])

  const openCreate = () => {
    setForm({
      direction: 'expense', doc_date: today(),
      account_id: String(accounts[0]?.id || ''), category: 'Цалин',
      partner: { type: '', id: null, name: '' }, description: '', amount: '',
    })
    setShow(true)
  }

  const setDirection = (direction) =>
    setForm(f => ({
      ...f, direction,
      category: direction === 'expense' ? 'Цалин' : 'Бусад орлого',
    }))

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) return toast.error('Дүн оруулна уу')
    if (!form.account_id)       return toast.error('Данс сонгоно уу')
    if (form.partner.type && form.partner.type !== '' && !form.partner.name)
      return toast.error('Харилцагчаа сонгоно уу')
    try {
      await financeApi.createTx({
        direction: form.direction,
        doc_date: form.doc_date,
        account_id: parseInt(form.account_id),
        category: form.category,
        partner_type: form.partner.type || null,
        partner_id: form.partner.id,
        partner_name: form.partner.name || null,
        description: form.description.trim() || null,
        amount,
      })
      toast.success('Гүйлгээ бүртгэгдлээ')
      setShow(false); fetch(); onDataChange?.()
    } catch {}
  }

  const handleDelete = async (row) => {
    const warn = row.debt_id
      ? '\nЭнэ нь тооцооны төлбөр тул тооцоо дахин нээгдэнэ.' : ''
    if (!confirm(`Гүйлгээг устгах уу?${warn}`)) return
    try {
      await financeApi.removeTx(row.id)
      toast.success('Устгагдлаа'); fetch(); onDataChange?.()
    } catch {}
  }

  const accName = (id) => accounts.find(a => a.id === id)?.name || '—'
  const cats = form.direction === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800">Кассын журнал</h2>
          <p className="text-xs text-gray-500">Орлого, зарлага (цалин, түрээс г.м.) — POS борлуулалт энд бичигдэхгүй, тайланд автоматаар орно</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Гүйлгээ нэмэх
        </button>
      </div>

      {/* Шүүлт */}
      <div className="flex items-center gap-2 flex-wrap">
        {[['', 'Бүгд'], ['income', 'Орлого'], ['expense', 'Зарлага']].map(([v, l]) => (
          <button key={v} onClick={() => setDir(v)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium
              ${dirFilter === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {l}
          </button>
        ))}
        <select className="input !w-auto" value={accFilter} onChange={e => setAcc(e.target.value)}>
          <option value="">Бүх данс</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Гүйлгээ алга</div>
        )}
        {rows.map(row => (
          <div key={row.id} className="p-3 flex items-center gap-3">
            {row.direction === 'income'
              ? <ArrowDownCircle className="w-6 h-6 text-green-500 shrink-0" />
              : <ArrowUpCircle className="w-6 h-6 text-red-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800 text-sm">{row.category}</span>
                {row.partner_name && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {row.partner_name}
                  </span>
                )}
                {row.purchase_id && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Худалдан авалт</span>}
                {row.debt_id && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600">Тооцоо</span>}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {dayjs(row.doc_date).format('YYYY/MM/DD')} · {accName(row.account_id)}
                {row.description && <span> · {row.description}</span>}
                {row.created_by && <span> · {row.created_by}</span>}
              </div>
            </div>
            <span className={`font-bold whitespace-nowrap ${row.direction === 'income' ? 'text-green-600' : 'text-red-600'}`}>
              {row.direction === 'income' ? '+' : '−'}{fmt(row.amount)}
            </span>
            <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Устгах">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="Шинэ гүйлгээ" onClose={() => setShow(false)}
               onSubmit={handleSubmit} submitLabel="Хадгалах">
          <Field label="Чиглэл *">
            <div className="flex gap-2">
              <button type="button" onClick={() => setDirection('income')}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.direction === 'income' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                Орлого
              </button>
              <button type="button" onClick={() => setDirection('expense')}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.direction === 'expense' ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500'}`}>
                Зарлага
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо *">
              <input type="date" className="input" value={form.doc_date}
                onChange={e => setForm({ ...form, doc_date: e.target.value })} />
            </Field>
            <Field label="Данс *">
              <select className="input" value={form.account_id}
                onChange={e => setForm({ ...form, account_id: e.target.value })}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Ангилал *">
            <select className="input" value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Харилцагч">
            <PartnerPicker value={form.partner}
              onChange={p => setForm({ ...form, partner: p })}
              suppliers={suppliers} employees={employees} />
          </Field>
          <Field label="Гүйлгээний утга">
            <input className="input" placeholder="Ж: 8-р сарын цалин" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Дүн (₮) *">
            <input className="input" type="number" placeholder="0" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Авлага / Өглөг
═══════════════════════════════════════════════════════ */
function DebtsTab({ accounts, suppliers, employees, onDataChange }) {
  const [rows, setRows]         = useState([])
  const [kind, setKind]         = useState('receivable')
  const [status, setStatus]     = useState('open')
  const [showModal, setShow]    = useState(false)
  const [paying, setPaying]     = useState(null)
  const [payForm, setPayForm]   = useState({ amount: '', account_id: '', doc_date: today(), description: '' })
  const [form, setForm] = useState({
    kind: 'receivable', partner: { type: 'other', id: null, name: '' },
    amount: '', doc_date: today(), description: '',
  })

  const fetch = useCallback(() => {
    const params = { kind }
    if (status) params.status = status
    financeApi.debts(params).then(r => setRows(r.data)).catch(() => {})
  }, [kind, status])

  useEffect(() => { fetch() }, [fetch])

  const openCreate = () => {
    setForm({
      kind, partner: { type: kind === 'payable' ? 'supplier' : 'other', id: null, name: '' },
      amount: '', doc_date: today(), description: '',
    })
    setShow(true)
  }

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0)  return toast.error('Дүн оруулна уу')
    if (!form.partner.name)      return toast.error('Харилцагчаа сонгоно уу')
    try {
      await financeApi.createDebt({
        kind: form.kind,
        partner_type: form.partner.type || 'other',
        partner_id: form.partner.id,
        partner_name: form.partner.name,
        description: form.description.trim() || null,
        amount, doc_date: form.doc_date,
      })
      toast.success('Тооцоо үүслээ')
      setShow(false); fetch(); onDataChange?.()
    } catch {}
  }

  const openPay = (row) => {
    setPaying(row)
    setPayForm({
      amount: String(row.amount - row.paid_amount),
      account_id: String(accounts[0]?.id || ''),
      doc_date: today(), description: '',
    })
  }

  const handlePay = async () => {
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) return toast.error('Дүн оруулна уу')
    try {
      await financeApi.payDebt(paying.id, {
        amount, account_id: parseInt(payForm.account_id),
        doc_date: payForm.doc_date, description: payForm.description.trim() || null,
      })
      toast.success(paying.kind === 'receivable' ? 'Авлага төлөгдлөө' : 'Өглөг төлөгдлөө')
      setPaying(null); fetch(); onDataChange?.()
    } catch {}
  }

  const handleDelete = async (row) => {
    if (!confirm('Тооцоог устгах уу?')) return
    try { await financeApi.removeDebt(row.id); toast.success('Устгагдлаа'); fetch(); onDataChange?.() } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800">Авлага / Өглөгийн тооцоо</h2>
          <p className="text-xs text-gray-500">Зээлсэн мөнгө, нийлүүлэгчийн тооцоог үүсгэж, төлж хаана</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Тооцоо үүсгэх
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setKind('receivable')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium
            ${kind === 'receivable' ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Авлага — бидэнд өртэй
        </button>
        <button onClick={() => setKind('payable')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium
            ${kind === 'payable' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Өглөг — бид өртэй
        </button>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        {[['open', 'Нээлттэй'], ['closed', 'Хаагдсан'], ['', 'Бүгд']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium
              ${status === v ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Тооцоо алга</div>
        )}
        {rows.map(row => {
          const remaining = row.amount - row.paid_amount
          return (
            <div key={row.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{row.partner_name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {PARTNER_LABELS[row.partner_type] || row.partner_type}
                  </span>
                  {row.status === 'closed'
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Хаагдсан</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Нээлттэй</span>}
                  {row.purchase_id && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Худалдан авалт</span>}
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">
                  {fmtDate(row.doc_date)}{row.description && ` · ${row.description}`}
                  {row.paid_amount > 0 && row.status === 'open' && (
                    <span className="text-green-600"> · төлсөн {fmt(row.paid_amount)}</span>
                  )}
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-bold text-gray-800">{fmt(row.amount)}</div>
                {row.status === 'open' && row.paid_amount > 0 && (
                  <div className="text-xs text-red-500">үлд: {fmt(remaining)}</div>
                )}
              </div>
              {row.status === 'open' && (
                <button onClick={() => openPay(row)}
                  className={`px-2.5 py-1.5 rounded-lg text-white text-xs font-medium inline-flex items-center gap-1
                    ${row.kind === 'receivable' ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                  <HandCoins size={13} /> {row.kind === 'receivable' ? 'Төлүүлэх' : 'Төлөх'}
                </button>
              )}
              {row.paid_amount === 0 && !row.purchase_id && (
                <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Устгах">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {showModal && (
        <Modal title="Тооцоо үүсгэх" onClose={() => setShow(false)}
               onSubmit={handleSubmit} submitLabel="Үүсгэх">
          <Field label="Төрөл *">
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, kind: 'receivable', partner: { type: 'other', id: null, name: '' } }))}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.kind === 'receivable' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-gray-200 text-gray-500'}`}>
                Авлага (бидэнд өртэй)
              </button>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, kind: 'payable', partner: { type: 'supplier', id: null, name: '' } }))}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium
                  ${form.kind === 'payable' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-500'}`}>
                Өглөг (бид өртэй)
              </button>
            </div>
          </Field>
          <Field label="Харилцагч *">
            <PartnerPicker value={form.partner}
              onChange={p => setForm({ ...form, partner: p })}
              suppliers={suppliers} employees={employees} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дүн (₮) *">
              <input className="input" type="number" placeholder="0" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Огноо *">
              <input type="date" className="input" value={form.doc_date}
                onChange={e => setForm({ ...form, doc_date: e.target.value })} />
            </Field>
          </div>
          <Field label="Гүйлгээний утга">
            <input className="input" placeholder="Ж: зээлсэн мөнгө" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
        </Modal>
      )}

      {paying && (
        <Modal
          title={`${paying.partner_name} — ${paying.kind === 'receivable' ? 'авлага төлүүлэх' : 'өглөг төлөх'}`}
          onClose={() => setPaying(null)} onSubmit={handlePay} submitLabel="Төлбөр бүртгэх">
          <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
            Нийт {fmt(paying.amount)} · Төлсөн {fmt(paying.paid_amount)} ·
            <span className="font-bold text-gray-800"> Үлдэгдэл {fmt(paying.amount - paying.paid_amount)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Төлөх дүн (₮) *">
              <input className="input" type="number" value={payForm.amount}
                onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
            </Field>
            <Field label="Данс *">
              <select className="input" value={payForm.account_id}
                onChange={e => setPayForm({ ...payForm, account_id: e.target.value })}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо *">
              <input type="date" className="input" value={payForm.doc_date}
                onChange={e => setPayForm({ ...payForm, doc_date: e.target.value })} />
            </Field>
            <Field label="Утга">
              <input className="input" value={payForm.description}
                onChange={e => setPayForm({ ...payForm, description: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Нийлүүлэгч
═══════════════════════════════════════════════════════ */
function SuppliersTab({ suppliers, onRefresh }) {
  const [showModal, setShow]  = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState({ name: '', phone: '', notes: '' })

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', notes: '' }); setShow(true) }
  const openEdit = (row) => {
    setEditing(row)
    setForm({ name: row.name, phone: row.phone || '', notes: row.notes || '' })
    setShow(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Нэр оруулна уу')
    const data = { name: form.name.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null }
    try {
      if (editing) { await financeApi.updateSupplier(editing.id, data); toast.success('Шинэчлэгдлээ') }
      else         { await financeApi.createSupplier(data);             toast.success('Нэмэгдлээ')    }
      setShow(false); onRefresh()
    } catch {}
  }

  const handleDelete = async (row) => {
    if (!confirm(`"${row.name}" нийлүүлэгчийг устгах уу?`)) return
    try { await financeApi.removeSupplier(row.id); toast.success('Устгагдлаа'); onRefresh() } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800">Нийлүүлэгч</h2>
          <p className="text-xs text-gray-500">{suppliers.length} нийлүүлэгч</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Нийлүүлэгч нэмэх
        </button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        {suppliers.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">Нийлүүлэгч бүртгэгдээгүй байна</div>
        )}
        {suppliers.map(row => (
          <div key={row.id} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm">{row.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {row.phone || '—'}{row.notes && ` · ${row.notes}`}
              </p>
            </div>
            {row.payable_balance > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700 font-bold whitespace-nowrap">
                Өглөг: {fmt(row.payable_balance)}
              </span>
            )}
            <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Засах">
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Устгах">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Нийлүүлэгч засах' : 'Шинэ нийлүүлэгч'}
               onClose={() => setShow(false)} onSubmit={handleSubmit}
               submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}>
          <Field label="Нэр *">
            <input className="input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Утас">
            <input className="input" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Тэмдэглэл">
            <input className="input" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Данс
═══════════════════════════════════════════════════════ */
function AccountsTab({ accounts, onRefresh }) {
  const [showModal, setShow]  = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', sort_order: '0', pos_cash: false, pos_transfer: false, pos_card: false })

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', sort_order: String(accounts.length), pos_cash: false, pos_transfer: false, pos_card: false })
    setShow(true)
  }
  const openEdit = (row) => {
    setEditing(row)
    setForm({
      name: row.name, sort_order: String(row.sort_order),
      pos_cash: row.pos_cash, pos_transfer: row.pos_transfer, pos_card: row.pos_card,
    })
    setShow(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Нэр оруулна уу')
    const data = {
      name: form.name.trim(), sort_order: parseInt(form.sort_order) || 0,
      pos_cash: form.pos_cash, pos_transfer: form.pos_transfer, pos_card: form.pos_card,
    }
    try {
      if (editing) { await financeApi.updateAccount(editing.id, data); toast.success('Шинэчлэгдлээ') }
      else         { await financeApi.createAccount(data);             toast.success('Нэмэгдлээ')    }
      setShow(false); onRefresh()
    } catch {}
  }

  const handleDelete = async (row) => {
    if (!confirm(`"${row.name}" дансыг идэвхгүй болгох уу?`)) return
    try { await financeApi.removeAccount(row.id); toast.success('Идэвхгүй боллоо'); onRefresh() } catch {}
  }

  const PosFlag = ({ on, label }) => on ? (
    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{label}</span>
  ) : null

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800">Мөнгөн данс</h2>
          <p className="text-xs text-gray-500">POS-ийн төлбөр аль дансанд орохыг холбоно</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Данс нэмэх
        </button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm divide-y">
        {accounts.map(row => (
          <div key={row.id} className="p-3 flex items-center gap-3">
            <Landmark className="w-5 h-5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800 text-sm">{row.name}</span>
                <PosFlag on={row.pos_cash} label="POS бэлэн" />
                <PosFlag on={row.pos_transfer} label="POS шилжүүлэг" />
                <PosFlag on={row.pos_card} label="POS карт" />
              </div>
            </div>
            <span className={`font-bold whitespace-nowrap ${row.balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
              {fmt(row.balance)}
            </span>
            <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Засах">
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Идэвхгүй болгох">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Данс засах' : 'Шинэ данс'}
               onClose={() => setShow(false)} onSubmit={handleSubmit}
               submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}>
          <Field label="Нэр *">
            <input className="input" placeholder="Ж: Хаан банк" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Эрэмбэ">
            <input className="input" type="number" value={form.sort_order}
              onChange={e => setForm({ ...form, sort_order: e.target.value })} />
          </Field>
          <Field label="POS-ийн төлбөр энэ данс руу орно">
            <div className="space-y-1.5">
              {[['pos_cash', 'Бэлэн мөнгө'], ['pos_transfer', 'Шилжүүлэг'], ['pos_card', 'Карт']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form[k]}
                    onChange={e => setForm({ ...form, [k]: e.target.checked })} />
                  {l}
                </label>
              ))}
              <p className="text-xs text-gray-400">
                Нэг төлбөрийн хэлбэр зөвхөн нэг дансанд — өөр дансанд байсан бол автоматаар шилжинэ
              </p>
            </div>
          </Field>
        </Modal>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════
   Үндсэн хуудас
═══════════════════════════════════════════════════════ */
function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-2.5 sm:px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all shrink-0
        ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
      {icon}{label}
    </button>
  )
}

export default function FinancePage() {
  const [tab, setTab]           = useState('report')
  const [accounts, setAccounts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [employees, setEmployees] = useState([])

  const loadShared = useCallback(() => {
    financeApi.accounts().then(r => setAccounts(r.data)).catch(() => {})
    financeApi.suppliers().then(r => setSuppliers(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadShared()
    usersApi.list().then(r => setEmployees((r.data || []).filter(u => u.is_active))).catch(() => {})
  }, [loadShared])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white border-b px-2 flex shrink-0 overflow-x-auto gap-1 py-1.5 scrollbar-hide">
        <TabBtn active={tab === 'report'} onClick={() => setTab('report')}
          icon={<TrendingUp className="w-3.5 h-3.5" />} label="Тайлан" />
        <TabBtn active={tab === 'purchases'} onClick={() => setTab('purchases')}
          icon={<PackagePlus className="w-3.5 h-3.5" />} label="Худалдан авалт" />
        <TabBtn active={tab === 'journal'} onClick={() => setTab('journal')}
          icon={<BookOpen className="w-3.5 h-3.5" />} label="Кассын журнал" />
        <TabBtn active={tab === 'debts'} onClick={() => setTab('debts')}
          icon={<Scale className="w-3.5 h-3.5" />} label="Авлага / Өглөг" />
        <TabBtn active={tab === 'suppliers'} onClick={() => setTab('suppliers')}
          icon={<Truck className="w-3.5 h-3.5" />} label="Нийлүүлэгч" />
        <TabBtn active={tab === 'accounts'} onClick={() => setTab('accounts')}
          icon={<Landmark className="w-3.5 h-3.5" />} label="Данс" />
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 pb-20 md:pb-4">
        {tab === 'report'    && <ReportTab />}
        {tab === 'purchases' && <PurchasesTab suppliers={suppliers} accounts={accounts} onDataChange={loadShared} />}
        {tab === 'journal'   && <JournalTab accounts={accounts} suppliers={suppliers} employees={employees} onDataChange={loadShared} />}
        {tab === 'debts'     && <DebtsTab accounts={accounts} suppliers={suppliers} employees={employees} onDataChange={loadShared} />}
        {tab === 'suppliers' && <SuppliersTab suppliers={suppliers} onRefresh={loadShared} />}
        {tab === 'accounts'  && <AccountsTab accounts={accounts} onRefresh={loadShared} />}
      </div>
    </div>
  )
}
