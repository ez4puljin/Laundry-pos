import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Edit2, Trash2, AlertTriangle, ToggleLeft, ToggleRight, Package, Wrench, Tag, Settings, Ticket, MessageSquare, Star, Receipt, ShowerHead, DoorOpen, Save, Eraser, MousePointerClick, Building2, UserCog, ShieldCheck, MapPin, KeyRound, X, DatabaseBackup, Download, Upload, RotateCcw, Clock, HardDrive } from 'lucide-react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import { servicesApi, inventoryApi, categoriesApi, machinesApi, ordersApi, settingsApi, roomsApi, roomTypesApi, showerTariffsApi, productCategoriesApi, branchesApi, globalUsersApi, backupApi } from '../api/client'
import { GRID_COLS, GRID_ROWS } from '../components/RoomMap'
import useBrandStore from '../store/useBrandStore'
import useAuthStore from '../store/useAuthStore'
import useBranchStore from '../store/useBranchStore'

const MACHINE_TYPE_OPTIONS = [
  { value: 'washer',      label: 'Угаалга' },
  { value: 'dryer',       label: 'Хатаалга' },
  { value: 'shoe_washer', label: 'Пүүз угаалга' },
]
const MACHINE_TYPE_LABELS = { washer: '🧼 Угаалга', dryer: '🌬️ Хатаалга', shoe_washer: '👟 Пүүз' }

const UNIT_OPTIONS = ['ширхэг', 'кг', 'литр', 'сав']

const COLOR_PRESETS = [
  { gradient: 'from-blue-400 to-blue-600',     badge: 'bg-blue-100 text-blue-700',     preview: 'bg-blue-500'   },
  { gradient: 'from-purple-400 to-purple-600', badge: 'bg-purple-100 text-purple-700', preview: 'bg-purple-500' },
  { gradient: 'from-orange-400 to-orange-600', badge: 'bg-orange-100 text-orange-700', preview: 'bg-orange-500' },
  { gradient: 'from-green-400 to-green-600',   badge: 'bg-green-100 text-green-700',   preview: 'bg-green-500'  },
  { gradient: 'from-red-400 to-red-600',       badge: 'bg-red-100 text-red-700',       preview: 'bg-red-500'    },
  { gradient: 'from-pink-400 to-pink-600',     badge: 'bg-pink-100 text-pink-700',     preview: 'bg-pink-500'   },
  { gradient: 'from-teal-400 to-teal-600',     badge: 'bg-teal-100 text-teal-700',     preview: 'bg-teal-500'   },
  { gradient: 'from-gray-400 to-gray-600',     badge: 'bg-gray-100 text-gray-600',     preview: 'bg-gray-500'   },
]

// ══════════════════════════════════════════════════════════
//  Удирдлагын цэс — 4 бүлэг, бүлэг тус бүр дэд табтай
// ══════════════════════════════════════════════════════════
const GROUPS = [
  {
    id: 'laundry', label: 'Угаалга', icon: Wrench,
    accent: 'bg-blue-600', ring: 'ring-blue-200', soft: 'bg-blue-50 text-blue-700',
    tabs: [
      { id: 'services',   label: 'Угаалгын үйлчилгээ', icon: Wrench },
      { id: 'categories', label: 'Үйлчилгээний ангилал', icon: Tag },
      { id: 'machines',   label: 'Угаалгын машин', icon: Settings },
    ],
  },
  {
    id: 'goods', label: 'Бараа', icon: Package,
    accent: 'bg-green-600', ring: 'ring-green-200', soft: 'bg-green-50 text-green-700',
    tabs: [
      { id: 'inventory',  label: 'Бараа материал', icon: Package },
      { id: 'prodcats',   label: 'Барааны ангилал', icon: Tag },
    ],
  },
  {
    id: 'shower', label: 'Шүршүүр', icon: ShowerHead,
    accent: 'bg-cyan-600', ring: 'ring-cyan-200', soft: 'bg-cyan-50 text-cyan-700',
    tabs: [
      { id: 'tariffs',   label: 'Шүршүүрийн тариф', icon: ShowerHead },
      { id: 'roomtypes', label: 'Өрөөний төрөл', icon: DoorOpen },
      { id: 'rooms',     label: 'Өрөөний байршил', icon: MousePointerClick },
    ],
  },
  {
    id: 'settings', label: 'Тохиргоо', icon: Settings,
    accent: 'bg-slate-700', ring: 'ring-slate-200', soft: 'bg-slate-100 text-slate-700',
    tabs: [
      { id: 'coupons', label: 'Купон', icon: Ticket },
      { id: 'points',  label: 'Оноо', icon: Star },
      { id: 'brand',   label: 'Байгууллагын нэр', icon: Building2 },
      { id: 'receipt', label: 'Баримт загвар', icon: Receipt },
      { id: 'sms',     label: 'SMS Gateway', icon: MessageSquare },
      // Салбар ба бүх салбарын хэрэглэгч — ЗӨВХӨН админ
      { id: 'branches', label: 'Салбар', icon: Building2, adminOnly: true },
      { id: 'gusers',   label: 'Бүх салбарын хэрэглэгч', icon: UserCog,
        adminOnly: true },
      { id: 'backup',   label: 'Нөөшлөлт', icon: DatabaseBackup, adminOnly: true },
    ],
  },
]

/* Нягтлан юу засах вэ — Бараа материал ба Үйлчилгээ. Бусад тохиргоо,
   шүршүүр, салбарын удирдлага нь зөвхөн админд харагдана. */
const ACCOUNTANT_TABS = ['services', 'categories', 'inventory', 'prodcats']

function visibleGroups(role) {
  const isAdmin = role === 'admin'
  return GROUPS
    .map(g => ({
      ...g,
      tabs: g.tabs.filter(x => {
        if (x.adminOnly && !isAdmin) return false
        if (!isAdmin && role === 'accountant') return ACCOUNTANT_TABS.includes(x.id)
        return true
      }),
    }))
    .filter(g => g.tabs.length > 0)
}

export default function ManagePage() {
  const role = useAuthStore(s => s.user?.role)
  const groups = useMemo(() => visibleGroups(role), [role])

  const [group, setGroup]           = useState(groups[0]?.id || 'laundry')
  const [tab, setTab]               = useState(groups[0]?.tabs[0]?.id || 'services')
  const [categories, setCategories] = useState([])

  const loadCategories = () =>
    categoriesApi.list().then(r => setCategories(r.data)).catch(() => {})

  useEffect(() => { loadCategories() }, [])

  const activeGroup = groups.find(g => g.id === group) || groups[0]

  // Бүлэг солиход тухайн бүлгийн эхний таб руу шилжинэ
  const pickGroup = (g) => {
    setGroup(g.id)
    if (!g.tabs.some(x => x.id === tab)) setTab(g.tabs[0].id)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── 1-р түвшин: бүлэг ── */}
      <div className="bg-white border-b px-3 pt-2.5 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {groups.map(g => {
            const on = g.id === group
            const Icon = g.icon
            return (
              <button
                key={g.id}
                onClick={() => pickGroup(g)}
                className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-2 text-sm font-bold
                            rounded-t-xl whitespace-nowrap shrink-0 transition-all border-b-2
                            ${on
                              ? `${g.soft} border-current`
                              : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'}`}
              >
                <Icon className="w-4 h-4" />
                {g.label}
                <span className={`text-[10px] font-semibold px-1.5 rounded-full
                                  ${on ? 'bg-white/70' : 'bg-gray-100 text-gray-400'}`}>
                  {g.tabs.length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 2-р түвшин: дэд таб ── */}
      <div className="bg-gray-50 border-b px-3 py-2 shrink-0
                      flex gap-1.5 overflow-x-auto scrollbar-hide">
        {activeGroup?.tabs.map(x => (
          <TabBtn
            key={x.id}
            active={tab === x.id}
            accent={activeGroup.accent}
            onClick={() => setTab(x.id)}
            icon={<x.icon className="w-3.5 h-3.5" />}
            label={x.label}
          />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {tab === 'services'   && <ServicesTab categories={categories} />}
        {tab === 'categories' && <CategoriesTab categories={categories} onRefresh={loadCategories} />}
        {tab === 'machines'   && <MachinesTab />}
        {tab === 'inventory'  && <InventoryTab />}
        {tab === 'prodcats'   && <ProductCategoriesTab />}
        {tab === 'tariffs'    && <ShowerTariffsTab />}
        {tab === 'roomtypes'  && <RoomTypesTab />}
        {tab === 'rooms'      && <RoomsTab />}
        {tab === 'coupons'    && <CouponsTab />}
        {tab === 'points'     && <PointsTab />}
        {tab === 'brand'      && <BrandTab />}
        {tab === 'receipt'    && <ReceiptTab />}
        {tab === 'sms'        && <SmsTab />}
        {tab === 'branches'   && <BranchesTab />}
        {tab === 'gusers'     && <GlobalUsersTab />}
        {tab === 'backup'     && <BackupTab />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label, accent = 'bg-blue-600' }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-semibold
                  rounded-lg whitespace-nowrap transition-all shrink-0
        ${active
          ? `${accent} text-white shadow-sm`
          : 'text-gray-500 bg-white border border-gray-200 hover:bg-gray-100'}`}
    >
      {icon}{label}
    </button>
  )
}

// ══════════════════════════════════════════════════════════
// SERVICES TAB
// ══════════════════════════════════════════════════════════
function ServicesTab({ categories }) {
  const [services, setServices] = useState([])
  const [machines, setMachines] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm] = useState({
    code: '', name: '', price: '', category: '',
    unit: 'ширхэг', duration_min: '60', points_earn: '1', machine_ids: []
  })

  const fetch = () =>
    servicesApi.list({ active_only: false }).then(r => setServices(r.data))

  const fetchMachines = () =>
    machinesApi.list({ active_only: false }).then(r => setMachines(r.data)).catch(() => {})

  useEffect(() => { fetch(); fetchMachines() }, [])

  // Categories ирэх үед default сонголт
  useEffect(() => {
    if (categories.length > 0 && !form.category) {
      setForm(p => ({ ...p, category: categories[0].value }))
    }
  }, [categories])

  const openCreate = () => {
    setEditing(null)
    setForm({ code: '', name: '', price: '', category: categories[0]?.value || 'general', unit: 'ширхэг', duration_min: '60', points_earn: '1', machine_ids: [] })
    setShowModal(true)
  }

  const openEdit = (s) => {
    setEditing(s)
    setForm({
      code: s.code, name: s.name, price: String(s.price),
      category: s.category, unit: s.unit,
      duration_min: String(s.duration_min), points_earn: String(s.points_earn),
      machine_ids: s.machine_ids || []
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) return toast.error('Нэр, үнэ оруулна уу')
    const data = {
      ...form,
      price:        parseFloat(form.price)        || 0,
      duration_min: parseInt(form.duration_min)   || 60,
      points_earn:  parseInt(form.points_earn)    || 1,
      machine_ids:  form.machine_ids,
    }
    try {
      if (editing) {
        await servicesApi.update(editing.id, {
          name: data.name, price: data.price,
          category: data.category, unit: data.unit,
          duration_min: data.duration_min,
          machine_ids: data.machine_ids,
        })
        toast.success('Үйлчилгээ шинэчлэгдлээ')
      } else {
        if (!form.code.trim()) return toast.error('Код оруулна уу')
        await servicesApi.create(data)
        toast.success('Үйлчилгээ нэмэгдлээ')
      }
      setShowModal(false)
      fetch()
    } catch (e) {
      console.error('Service save error:', e)
    }
  }

  const handleToggle = async (s) => {
    await servicesApi.update(s.id, { is_active: !s.is_active })
    toast.success(s.is_active ? 'Идэвхгүй болголоо' : 'Идэвхтэй болголоо')
    fetch()
  }

  const handleDelete = async (s) => {
    if (!confirm(`"${s.name}" устгах уу?`)) return
    await servicesApi.remove(s.id)
    toast.success('Устгагдлаа')
    fetch()
  }

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-lg text-gray-800">Угаалгын үйлчилгээ</h2>
          <p className="text-sm text-gray-500 mt-0.5">{services.length} үйлчилгээ бүртгэлтэй</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                     text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Үйлчилгээ нэмэх
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* ── Mobile cards (md-аас доош) ── */}
        <div className="md:hidden divide-y divide-gray-100">
          {services.map(s => {
            const cat = categories.find(c => c.value === s.category)
            return (
              <div key={s.id} className={`px-4 py-3 ${s.is_active ? '' : 'opacity-55 bg-gray-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                      {s.code}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.unit}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => handleToggle(s)}
                      className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                      {s.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(s)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(s)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${cat?.badge_color || 'bg-gray-100 text-gray-600'}`}>
                    {cat?.label || s.category}
                  </span>
                  <span className="font-bold text-blue-600 text-sm">{s.price.toLocaleString()}₮</span>
                  <span className="text-xs text-gray-400">{s.duration_min}мин</span>
                  {s.is_active
                    ? <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">✓ Идэвхтэй</span>
                    : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium">Идэвхгүй</span>
                  }
                </div>
              </div>
            )
          })}
          {services.length === 0 && (
            <div className="text-center text-gray-400 py-12">Үйлчилгээ бүртгэгдээгүй байна</div>
          )}
        </div>

        {/* ── Desktop table (md+) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Код</th>
                <th className="text-left px-5 py-3">Нэр</th>
                <th className="text-left px-5 py-3">Ангилал</th>
                <th className="text-right px-5 py-3">Үнэ</th>
                <th className="text-center px-5 py-3">Хугацаа</th>
                <th className="text-center px-5 py-3">Статус</th>
                <th className="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id} className={`border-b transition-colors
                  ${s.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60 hover:opacity-80'}`}>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      {s.code}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-sm text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.unit}</p>
                  </td>
                  <td className="px-5 py-3">
                    {(() => {
                      const cat = categories.find(c => c.value === s.category)
                      return (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                          ${cat?.badge_color || 'bg-gray-100 text-gray-600'}`}>
                          {cat?.label || s.category}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-blue-600 text-sm">
                    {s.price.toLocaleString()}₮
                  </td>
                  <td className="px-5 py-3 text-center text-sm text-gray-500">
                    {s.duration_min}мин
                  </td>
                  <td className="px-5 py-3 text-center">
                    {s.is_active
                      ? <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">✓ Идэвхтэй</span>
                      : <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full font-medium">Идэвхгүй</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => handleToggle(s)}
                        title={s.is_active ? 'Идэвхгүй болгох' : 'Идэвхтэй болгох'}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                        {s.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(s)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {services.length === 0 && (
            <div className="text-center text-gray-400 py-12">Үйлчилгээ бүртгэгдээгүй байна</div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={editing ? 'Үйлчилгээ засах' : 'Шинэ үйлчилгээ нэмэх'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          {!editing && (
            <Field label="Код *">
              <input
                className="input"
                placeholder="Жишээ: W07"
                value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              />
            </Field>
          )}
          <Field label="Нэр *">
            <input
              className="input"
              placeholder="Жишээ: Пальто угаалга"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Үнэ (₮) *">
              <input
                type="number" className="input"
                placeholder="0"
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              />
            </Field>
            <Field label="Нэгж">
              <select className="input" value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Ангилал">
            <select className="input" value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {categories.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Хугацаа (мин)">
              <input
                type="number" className="input"
                placeholder="60"
                value={form.duration_min}
                onChange={e => setForm(p => ({ ...p, duration_min: e.target.value }))}
              />
            </Field>
            <Field label="Оноо олгох">
              <input
                type="number" className="input"
                placeholder="1"
                value={form.points_earn}
                onChange={e => setForm(p => ({ ...p, points_earn: e.target.value }))}
              />
            </Field>
          </div>
          {machines.filter(m => m.is_active).length > 0 && (
            <Field label="Машин сонгох">
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                {machines.filter(m => m.is_active).map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer py-1 px-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={form.machine_ids.includes(m.id)}
                      onChange={() => {
                        setForm(p => ({
                          ...p,
                          machine_ids: p.machine_ids.includes(m.id)
                            ? p.machine_ids.filter(id => id !== m.id)
                            : [...p.machine_ids, m.id]
                        }))
                      }}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span>{m.name}</span>
                    <span className="text-xs text-gray-400">({MACHINE_TYPE_LABELS[m.machine_type] || m.machine_type})</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// INVENTORY TAB
// ══════════════════════════════════════════════════════════
function InventoryTab() {
  const [items, setItems]         = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [adjustItem, setAdjustItem] = useState(null)   // орлого/зарлага modal
  const [adjustQty, setAdjustQty]   = useState('')
  const [form, setForm] = useState({
    name: '', unit: 'кг', quantity: '', min_quantity: '1',
    cost_price: '', sale_price: '', is_for_sale: false, supplier: '', category_id: ''
  })

  const [prodCats, setProdCats] = useState([])

  const fetch = () => inventoryApi.list().then(r => setItems(r.data))

  useEffect(() => {
    fetch()
    productCategoriesApi.list({ active_only: true })
      .then(r => setProdCats(r.data || [])).catch(() => {})
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '', unit: 'кг', quantity: '', min_quantity: '1',
      cost_price: '', sale_price: '', is_for_sale: false, supplier: '', category_id: ''
    })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      name:         item.name,
      unit:         item.unit,
      quantity:     String(item.quantity),
      min_quantity: String(item.min_quantity),
      cost_price:   String(item.cost_price),
      sale_price:   String(item.sale_price),
      is_for_sale:  item.is_for_sale,
      supplier:     item.supplier || '',
      category_id:  item.category_id ? String(item.category_id) : '',
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Нэр оруулна уу')
    const data = {
      ...form,
      quantity:     parseFloat(form.quantity)     || 0,
      min_quantity: parseFloat(form.min_quantity) || 1,
      cost_price:   parseFloat(form.cost_price)   || 0,
      sale_price:   parseFloat(form.sale_price)   || 0,
      is_for_sale:  form.is_for_sale,
      category_id:  form.category_id ? parseInt(form.category_id) : null,
    }
    if (data.is_for_sale && data.sale_price <= 0) {
      return toast.error('POS-оос зарахын тулд зарах үнэ оруулна уу')
    }
    try {
      if (editing) {
        await inventoryApi.update(editing.id, {
          quantity:     data.quantity,
          min_quantity: data.min_quantity,
          cost_price:   data.cost_price,
          sale_price:   data.sale_price,
          is_for_sale:  data.is_for_sale,
        })
        toast.success('Бараа шинэчлэгдлээ')
      } else {
        await inventoryApi.create(data)
        toast.success('Бараа нэмэгдлээ')
      }
      setShowModal(false)
      fetch()
    } catch (e) {
      console.error('Inventory save error:', e)
    }
  }

  const handleDelete = async (item) => {
    if (!confirm(`"${item.name}" устгах уу?`)) return
    await inventoryApi.remove(item.id)
    toast.success('Устгагдлаа')
    fetch()
  }

  const handleAdjust = async (isAdd) => {
    const qty = parseFloat(adjustQty)
    if (!qty || qty <= 0) return toast.error('Тоо оруулна уу')
    try {
      await inventoryApi.adjust(adjustItem.id, { quantity: isAdd ? qty : -qty })
      toast.success(isAdd ? `+${qty} нэмэгдлээ` : `-${qty} хасагдлаа`)
      setAdjustItem(null)
      setAdjustQty('')
      fetch()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Алдаа')
    }
  }

  const lowItems = items.filter(i => i.is_low)

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-lg text-gray-800">Бараа материал</h2>
          {lowItems.length > 0 ? (
            <p className="text-sm text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
              {lowItems.length} бараа бага үлдэгдэлтэй байна
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">{items.length} бараа бүртгэлтэй</p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                     text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Бараа нэмэх
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* ── Mobile cards (md-аас доош) ── */}
        <div className="md:hidden divide-y divide-gray-100">
          {items.map(item => (
            <div key={item.id} className={`px-4 py-3 ${item.is_low ? 'bg-red-50/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.unit}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => { setAdjustItem(item); setAdjustQty('') }}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Орлого нэмэх">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(item)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(item)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <div>
                  <span className="text-xs text-gray-400">Үлдэгдэл: </span>
                  <span className={`font-bold text-sm ${item.is_low ? 'text-red-600' : 'text-gray-800'}`}>
                    {item.quantity} {item.unit}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Доод: </span>
                  <span className="text-sm text-gray-600">{item.min_quantity} {item.unit}</span>
                </div>
                {item.is_for_sale && (
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                    POS: {item.sale_price.toLocaleString()}₮
                  </span>
                )}
                {item.is_low
                  ? <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      <AlertTriangle className="w-3 h-3" /> Бага
                    </span>
                  : <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">✓ Хангалттай</span>
                }
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center text-gray-400 py-12">Бараа материал бүртгэгдээгүй байна</div>
          )}
        </div>

        {/* ── Desktop table (md+) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Барааны нэр</th>
                <th className="text-left px-5 py-3">Ангилал</th>
                <th className="text-right px-5 py-3">Үлдэгдэл</th>
                <th className="text-right px-5 py-3">Доод хэмжээ</th>
                <th className="text-right px-5 py-3">Өртөг үнэ</th>
                <th className="text-right px-5 py-3">Зарах үнэ</th>
                <th className="text-center px-5 py-3">POS зарах</th>
                <th className="text-center px-5 py-3">Статус</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className={`border-b hover:bg-gray-50 transition-colors
                  ${item.is_low ? 'bg-red-50/30' : ''}`}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.unit}</p>
                  </td>
                  <td className="px-5 py-3">
                    {item.category ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium
                                       px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        <span className="w-2 h-2 rounded-full"
                              style={{ background: item.category.color }} />
                        {item.category.name}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className={`px-5 py-3 text-right font-bold text-sm
                    ${item.is_low ? 'text-red-600' : 'text-gray-800'}`}>
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-500">
                    {item.min_quantity} {item.unit}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600">
                    {item.cost_price.toLocaleString()}₮
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-green-700">
                    {item.is_for_sale ? `${item.sale_price.toLocaleString()}₮` : '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {item.is_for_sale ? (
                      <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">✓ Зарна</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-400 px-2.5 py-1 rounded-full text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {item.is_low ? (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700
                                       px-2.5 py-1 rounded-full text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" /> Бага
                      </span>
                    ) : (
                      <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">✓ Хангалттай</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => { setAdjustItem(item); setAdjustQty('') }}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Орлого нэмэх">
                        <Plus className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="text-center text-gray-400 py-12">Бараа материал бүртгэгдээгүй байна</div>
          )}
        </div>
      </div>

      {/* Modal */}
      {/* Орлого / Зарлага modal */}
      {adjustItem && (
        <Modal
          title={`${adjustItem.name} — Орлого нэмэх`}
          onClose={() => setAdjustItem(null)}
          onSubmit={() => handleAdjust(true)}
          submitLabel="Нэмэх"
        >
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Одоогийн үлдэгдэл</span>
              <span className="font-bold text-lg">{adjustItem.quantity} {adjustItem.unit}</span>
            </div>
            <Field label={`Нэмэх тоо (${adjustItem.unit})`}>
              <input type="number" min="0" step="0.1" value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)} autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="10" />
            </Field>
            {adjustQty && parseFloat(adjustQty) > 0 && (
              <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700">
                Шинэ үлдэгдэл: <strong>{(adjustItem.quantity + parseFloat(adjustQty)).toFixed(1)} {adjustItem.unit}</strong>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Бараа засах' : 'Шинэ бараа нэмэх'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          {!editing && (
            <>
              <Field label="Барааны нэр *">
                <input
                  className="input"
                  placeholder="Жишээ: Ariel угаалгын нунтаг"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Нэгж">
                  <select className="input" value={form.unit}
                    onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Нийлүүлэгч">
                  <input
                    className="input"
                    placeholder="Компани нэр"
                    value={form.supplier}
                    onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Ангилал">
                <select className="input" value={form.category_id}
                  onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">— Ангилалгүй —</option>
                  {prodCats.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {prodCats.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Барааны ангилал таб дээрээс эхлээд ангилал нэмнэ үү
                  </p>
                )}
              </Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Одоогийн үлдэгдэл">
              <input
                type="number" step="0.1" className="input"
                placeholder="0"
                value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
              />
            </Field>
            <Field label="Доод хэмжээ">
              <input
                type="number" step="0.1" className="input"
                placeholder="1"
                value={form.min_quantity}
                onChange={e => setForm(p => ({ ...p, min_quantity: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Өртөг үнэ (₮)">
            <input
              type="number" className="input"
              placeholder="0"
              value={form.cost_price}
              onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
            />
          </Field>

          {/* POS-оос зарах тохиргоо */}
          <div className="border rounded-xl p-3 bg-green-50/50 border-green-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">POS-оос зарах</p>
                <p className="text-xs text-gray-400">Энэ барааг POS кассчиндаа харуулах</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, is_for_sale: !p.is_for_sale }))}
                className={`relative w-11 h-6 rounded-full transition-colors
                  ${form.is_for_sale ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                  ${form.is_for_sale ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
            {form.is_for_sale && (
              <Field label="Зарах үнэ (₮) *">
                <input
                  type="number" className="input"
                  placeholder="0"
                  value={form.sale_price}
                  onChange={e => setForm(p => ({ ...p, sale_price: e.target.value }))}
                />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// CATEGORIES TAB
// ══════════════════════════════════════════════════════════
function CategoriesTab({ categories, onRefresh }) {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm] = useState({
    value: '', label: '', color: COLOR_PRESETS[0].gradient,
    badge_color: COLOR_PRESETS[0].badge, sort_order: '0'
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ value: '', label: '', color: COLOR_PRESETS[0].gradient, badge_color: COLOR_PRESETS[0].badge, sort_order: '0' })
    setShowModal(true)
  }

  const openEdit = (cat) => {
    setEditing(cat)
    setForm({
      value:       cat.value,
      label:       cat.label,
      color:       cat.color,
      badge_color: cat.badge_color,
      sort_order:  String(cat.sort_order),
    })
    setShowModal(true)
  }

  const selectPreset = (preset) => {
    setForm(p => ({ ...p, color: preset.gradient, badge_color: preset.badge }))
  }

  const handleSubmit = async () => {
    if (!form.label.trim()) return toast.error('Нэр оруулна уу')
    if (!editing && !form.value.trim()) return toast.error('Утга (slug) оруулна уу')
    const data = { ...form, sort_order: parseInt(form.sort_order) || 0 }
    try {
      if (editing) {
        await categoriesApi.update(editing.id, {
          label: data.label, color: data.color,
          badge_color: data.badge_color, sort_order: data.sort_order,
        })
        toast.success('Ангилал шинэчлэгдлээ')
      } else {
        await categoriesApi.create(data)
        toast.success('Ангилал нэмэгдлээ')
      }
      setShowModal(false)
      onRefresh()
    } catch (e) { console.error('Category save error:', e) }
  }

  const handleDelete = async (cat) => {
    if (!confirm(`"${cat.label}" устгах уу?`)) return
    try {
      await categoriesApi.remove(cat.id)
      toast.success('Устгагдлаа')
      onRefresh()
    } catch (e) { console.error('Category delete error:', e) }
  }

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-lg text-gray-800">Үйлчилгээний ангилал</h2>
          <p className="text-sm text-gray-500 mt-0.5">{categories.length} ангилал бүртгэлтэй</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                     text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm">
          <Plus className="w-4 h-4" /> Ангилал нэмэх
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* ── Mobile cards (md-аас доош) ── */}
        <div className="md:hidden divide-y divide-gray-100">
          {categories.map(cat => (
            <div key={cat.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                    {cat.value}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cat.badge_color}`}>
                    {cat.label}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => openEdit(cat)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(cat)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`flex-1 h-3 rounded-full bg-gradient-to-r ${cat.color}`} />
                <span className="text-xs text-gray-400 shrink-0">#{cat.sort_order}</span>
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="text-center text-gray-400 py-12">Ангилал бүртгэгдээгүй байна</div>
          )}
        </div>

        {/* ── Desktop table (md+) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Утга (slug)</th>
                <th className="text-left px-5 py-3">Нэр</th>
                <th className="text-left px-5 py-3">Өнгө</th>
                <th className="text-center px-5 py-3">Дараалал</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      {cat.value}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cat.badge_color}`}>
                      {cat.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className={`w-24 h-4 rounded-full bg-gradient-to-r ${cat.color}`} />
                  </td>
                  <td className="px-5 py-3 text-center text-sm text-gray-500">{cat.sort_order}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(cat)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(cat)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <div className="text-center text-gray-400 py-12">Ангилал бүртгэгдээгүй байна</div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={editing ? 'Ангилал засах' : 'Шинэ ангилал нэмэх'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          {!editing && (
            <Field label="Утга (slug) * — латин үсэг, доогуур зураас">
              <input className="input" placeholder="Жишээ: leather_clean, shoe_wash"
                value={form.value}
                onChange={e => setForm(p => ({ ...p, value: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }))}
              />
            </Field>
          )}
          <Field label="Нэр (emoji + Монгол) *">
            <input className="input" placeholder="Жишээ: 🧼 Угаалга"
              value={form.label}
              onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
            />
          </Field>
          <Field label="Өнгө сонгох">
            <div className="flex flex-wrap gap-2 mt-1">
              {COLOR_PRESETS.map((preset, i) => (
                <button key={i} type="button"
                  onClick={() => selectPreset(preset)}
                  className={`w-8 h-8 rounded-full ${preset.preview} ring-2 transition-all
                    ${form.color === preset.gradient ? 'ring-blue-500 scale-110' : 'ring-transparent hover:scale-105'}`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Жишээ харагдал:{' '}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${form.badge_color}`}>
                {form.label || 'Ангилал'}
              </span>
            </p>
          </Field>
          <Field label="Харагдах дараалал">
            <input type="number" className="input" placeholder="0"
              value={form.sort_order}
              onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))}
            />
          </Field>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// MACHINES TAB
// ══════════════════════════════════════════════════════════
function MachinesTab() {
  const [machines, setMachines] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', machine_type: 'washer', is_active: true })

  const fetch = () =>
    machinesApi.list({ active_only: false }).then(r => setMachines(r.data))

  useEffect(() => { fetch() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', machine_type: 'washer', is_active: true })
    setShowModal(true)
  }

  const openEdit = (m) => {
    setEditing(m)
    setForm({ name: m.name, machine_type: m.machine_type, is_active: m.is_active })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Нэр оруулна уу')
    try {
      if (editing) {
        await machinesApi.update(editing.id, form)
        toast.success('Машин шинэчлэгдлээ')
      } else {
        await machinesApi.create(form)
        toast.success('Машин нэмэгдлээ')
      }
      setShowModal(false)
      fetch()
    } catch (e) {
      console.error('Machine save error:', e)
    }
  }

  const handleToggle = async (m) => {
    await machinesApi.update(m.id, { is_active: !m.is_active })
    toast.success(m.is_active ? 'Идэвхгүй болголоо' : 'Идэвхтэй болголоо')
    fetch()
  }

  const handleDelete = async (m) => {
    if (!confirm(`"${m.name}" устгах уу?`)) return
    await machinesApi.remove(m.id)
    toast.success('Устгагдлаа')
    fetch()
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-lg text-gray-800">Машинууд</h2>
          <p className="text-sm text-gray-500 mt-0.5">{machines.length} машин бүртгэлтэй</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-colors text-sm">
          <Plus className="w-4 h-4" /> Машин нэмэх
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {machines.map(m => (
            <div key={m.id} className={`px-4 py-3 ${m.is_active ? '' : 'opacity-55 bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{m.machine_type === 'washer' ? '🧼' : m.machine_type === 'dryer' ? '🌬️' : '👟'}</span>
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                    <span className="text-xs text-gray-400">{MACHINE_TYPE_LABELS[m.machine_type]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleToggle(m)}
                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                    {m.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(m)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(m)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {m.is_active
                  ? <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">✓ Идэвхтэй</span>
                  : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium">Идэвхгүй</span>
                }
              </div>
            </div>
          ))}
          {machines.length === 0 && (
            <div className="text-center text-gray-400 py-12">Машин бүртгэгдээгүй байна</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Нэр</th>
                <th className="text-left px-5 py-3">Төрөл</th>
                <th className="text-center px-5 py-3">Статус</th>
                <th className="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {machines.map(m => (
                <tr key={m.id} className={`border-b transition-colors
                  ${m.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60 hover:opacity-80'}`}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-sm text-gray-800">{m.name}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-700">
                      {MACHINE_TYPE_LABELS[m.machine_type] || m.machine_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {m.is_active
                      ? <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">✓ Идэвхтэй</span>
                      : <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full font-medium">Идэвхгүй</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => handleToggle(m)}
                        title={m.is_active ? 'Идэвхгүй болгох' : 'Идэвхтэй болгох'}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                        {m.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(m)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(m)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {machines.length === 0 && (
            <div className="text-center text-gray-400 py-12">Машин бүртгэгдээгүй байна</div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={editing ? 'Машин засах' : 'Шинэ машин нэмэх'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          <Field label="Нэр *">
            <input className="input" placeholder="Жишээ: Угаалга #1"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field label="Төрөл">
            <select className="input" value={form.machine_type}
              onChange={e => setForm(p => ({ ...p, machine_type: e.target.value }))}>
              {MACHINE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Идэвхтэй эсэх">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">{form.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}</span>
            </label>
          </Field>
        </Modal>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════
export function Modal({ title, onClose, onSubmit, submitLabel, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          {children}
        </div>
        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium
                       text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Болих
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl
                       py-2.5 text-sm font-bold transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  RoomTypesTab – Шүршүүрийн өрөөний төрөл
// ══════════════════════════════════════════════════════════
const ROOM_COLOR_PRESETS = ['#38bdf8', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15']

/**
 * Нэр + хугацаа + өнгө + эрэмбэтэй жагсаалтын CRUD таб.
 * Шүршүүрийн тариф (үнэтэй) ба өрөөний төрөл (үнэгүй) хоёулаа үүнийг ашиглана.
 */
function ColorListTab({ api, title, subtitle, addLabel, namePlaceholder,
                        withPrice = false, pricePlaceholder = '5000',
                        withDuration = false, emptyText }) {
  const blank = { name: '', price: '', duration_min: '60', color: ROOM_COLOR_PRESETS[0], sort_order: '0' }
  const [rows, setRows]      = useState([])
  const [showModal, setShow] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]      = useState(blank)

  const fetch = () => api.list({ active_only: false }).then(r => setRows(r.data)).catch(() => {})
  useEffect(() => { fetch() }, [api])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blank, sort_order: String(rows.length) })
    setShow(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      name: row.name,
      price: withPrice ? String(row.price ?? '') : '',
      duration_min: String(row.duration_min ?? 60),
      color: row.color,
      sort_order: String(row.sort_order),
    })
    setShow(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Нэр оруулна уу')
    if (withPrice && !parseFloat(form.price)) return toast.error('Үнэ оруулна уу')
    const data = {
      name: form.name.trim(),
      color: form.color,
      sort_order: parseInt(form.sort_order) || 0,
      ...(withPrice ? { price: parseFloat(form.price) } : {}),
      ...(withDuration ? { duration_min: parseInt(form.duration_min) || 60 } : {}),
    }
    try {
      if (editing) { await api.update(editing.id, data); toast.success('Шинэчлэгдлээ') }
      else         { await api.create(data);             toast.success('Нэмэгдлээ')    }
      setShow(false); fetch()
    } catch { /* interceptor toast */ }
  }

  const handleToggle = async (row) => {
    try { await api.update(row.id, { is_active: !row.is_active }); fetch() } catch {}
  }

  const handleDelete = async (row) => {
    if (!confirm(`"${row.name}" устгах уу?`)) return
    try { await api.remove(row.id); toast.success('Устгагдлаа'); fetch() } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-500">{rows.length} мөр · {subtitle}</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                     rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> {addLabel}
        </button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">{emptyText}</div>
        )}

        {/* Mobile */}
        <div className="md:hidden divide-y">
          {rows.map(row => (
            <div key={row.id} className="p-3 flex items-center gap-3">
              <span className="w-3 h-8 rounded-full shrink-0" style={{ background: row.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{row.name}</p>
                <p className="text-xs text-gray-500">
                  {withPrice && `${row.price.toLocaleString()}₮`}
                  {withPrice && withDuration && ' · '}
                  {withDuration && `${row.duration_min}мин`}
                  {!row.is_active && <span className="text-gray-400"> · Идэвхгүй</span>}
                </p>
              </div>
              <RowActions row={row} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
            </div>
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Нэр</th>
                  {withPrice && <th className="text-left px-4 py-2.5 font-semibold">Үнэ</th>}
                  {withDuration && <th className="text-left px-4 py-2.5 font-semibold">Хугацаа</th>}
                  <th className="text-left px-4 py-2.5 font-semibold">Өнгө</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Статус</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                    {withPrice && <td className="px-4 py-2.5">{row.price.toLocaleString()}₮</td>}
                    {withDuration && (
                      <td className="px-4 py-2.5 text-gray-500">{row.duration_min} мин</td>
                    )}
                    <td className="px-4 py-2.5">
                      <span className="inline-block w-5 h-5 rounded-full border" style={{ background: row.color }} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {row.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <RowActions row={row} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Засах' : addLabel}
          onClose={() => setShow(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          <Field label="Нэр *">
            <input className="input" placeholder={namePlaceholder} value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {withPrice && (
              <Field label="Үнэ (₮) *">
                <input className="input" type="number" placeholder={pricePlaceholder} value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })} />
                <p className="text-[11px] text-gray-400 mt-1">НӨАТ багтсан үнэ</p>
              </Field>
            )}
            {withDuration && (
              <Field label="Хугацаа (мин)">
                <input className="input" type="number" value={form.duration_min}
                  onChange={e => setForm({ ...form, duration_min: e.target.value })} />
              </Field>
            )}
          </div>
          <Field label="Өнгө">
            <div className="flex gap-2 flex-wrap">
              {ROOM_COLOR_PRESETS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={`w-9 h-9 rounded-xl border-2 transition-all
                              ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </Field>
          <Field label="Эрэмбэ">
            <input className="input" type="number" value={form.sort_order}
              onChange={e => setForm({ ...form, sort_order: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  )
}

/** Шүршүүрийн тариф — ҮНЭ ЭНД. Хүн тус бүрээр төлбөр тооцно. */
function ShowerTariffsTab() {
  return (
    <ColorListTab
      api={showerTariffsApi}
      withPrice
      title="Шүршүүрийн тариф"
      subtitle="хүний төрөл бүрийн НӨАТ багтсан үнэ"
      addLabel="Тариф нэмэх"
      namePlaceholder="Том хүн"
      pricePlaceholder="5000"
      emptyText="Тариф алга. Эхний тарифаа нэмнэ үү."
    />
  )
}

/** Барааны ангилал — үйлчилгээнийхээс тусдаа, зөвхөн бараа бүлэглэнэ. */
function ProductCategoriesTab() {
  return (
    <ColorListTab
      api={productCategoriesApi}
      title="Барааны ангилал"
      subtitle="бараа материалыг бүлэглэх"
      addLabel="Ангилал нэмэх"
      namePlaceholder="Угаалгын нунтаг"
      emptyText="Ангилал алга. Эхний ангилалаа нэмнэ үү."
    />
  )
}

/** Өрөөний төрөл — тарифгүй, зөвхөн багтаамжийн ангилал. */
function RoomTypesTab() {
  return (
    <ColorListTab
      api={roomTypesApi}
      withDuration
      title="Өрөөний төрөл"
      subtitle="багтаамж · ашиглах хугацаа · зураглалын өнгө"
      addLabel="Төрөл нэмэх"
      namePlaceholder="2 хүний"
      emptyText="Төрөл алга. Эхний төрлөө нэмнэ үү."
    />
  )
}

function RowActions({ row, onToggle, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => onToggle(row)} className="p-1.5 rounded-lg hover:bg-gray-100"
        title={row.is_active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}>
        {row.is_active
          ? <ToggleRight className="w-4 h-4 text-green-600" />
          : <ToggleLeft className="w-4 h-4 text-gray-400" />}
      </button>
      <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Засах">
        <Edit2 className="w-4 h-4 text-gray-500" />
      </button>
      <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50" title="Устгах">
        <Trash2 className="w-4 h-4 text-red-500" />
      </button>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  RoomsTab – Өрөө + зураглалын editor
// ══════════════════════════════════════════════════════════
const overlaps = (a, b) =>
  a.map_x < b.map_x + b.map_w && b.map_x < a.map_x + a.map_w &&
  a.map_y < b.map_y + b.map_h && b.map_y < a.map_y + a.map_h

function RoomsTab() {
  const [rooms, setRooms]     = useState([])
  const [types, setTypes]     = useState([])
  const [showModal, setShow]  = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState({ number: '', room_type_id: '' })

  // Зураглалын төлөв
  const [layout, setLayout]   = useState([])
  const [selectedId, setSel]  = useState(null)
  const [drag, setDrag]       = useState(null)
  const [dirty, setDirty]     = useState(false)
  const gridRef = useRef(null)

  const fetch = () =>
    roomsApi.list().then(r => {
      setRooms(r.data)
      setLayout(r.data.map(x => ({ ...x })))
      setDirty(false)
    }).catch(() => {})

  useEffect(() => {
    fetch()
    roomTypesApi.list({ active_only: true }).then(r => setTypes(r.data)).catch(() => {})
  }, [])

  // ── CRUD ──
  const openCreate = () => {
    if (types.length === 0) return toast.error('Эхлээд өрөөний төрөл нэмнэ үү')
    setEditing(null)
    setForm({ number: '', room_type_id: String(types[0].id) })
    setShow(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({ number: row.number, room_type_id: String(row.room_type_id) })
    setShow(true)
  }

  const handleSubmit = async () => {
    if (!form.number.trim())    return toast.error('Өрөөний дугаар оруулна уу')
    if (!form.room_type_id)     return toast.error('Төрөл сонгоно уу')
    const data = { number: form.number.trim(), room_type_id: parseInt(form.room_type_id) }
    try {
      if (editing) { await roomsApi.update(editing.id, data); toast.success('Өрөө шинэчлэгдлээ') }
      else         { await roomsApi.create(data);             toast.success('Өрөө нэмэгдлээ')    }
      setShow(false); fetch()
    } catch {}
  }

  const handleToggle = async (row) => {
    try { await roomsApi.update(row.id, { is_active: !row.is_active }); fetch() } catch {}
  }

  const handleDelete = async (row) => {
    if (!confirm(`Өрөө №${row.number}-г устгах уу?`)) return
    try { await roomsApi.remove(row.id); toast.success('Устгагдлаа'); fetch() } catch {}
  }

  // ── Зураглал: нүд тооцоолол ──
  const cellOf = (e) => {
    const rect = gridRef.current.getBoundingClientRect()
    const px = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left
    const py = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top
    return {
      col: Math.min(GRID_COLS - 1, Math.max(0, Math.floor(px / (rect.width  / GRID_COLS)))),
      row: Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(py / (rect.height / GRID_ROWS)))),
    }
  }

  const onDown = (e) => {
    if (!selectedId) return toast('Эхлээд өрөө сонгоно уу', { id: 'sel-room' })
    const c = cellOf(e)
    setDrag({ startCol: c.col, startRow: c.row, curCol: c.col, curRow: c.row })
  }

  const onMove = (e) => {
    if (!drag) return
    const c = cellOf(e)
    setDrag(d => ({ ...d, curCol: c.col, curRow: c.row }))
  }

  const onUp = () => {
    if (!drag || !selectedId) { setDrag(null); return }
    const rect = {
      map_x: Math.min(drag.startCol, drag.curCol),
      map_y: Math.min(drag.startRow, drag.curRow),
      map_w: Math.abs(drag.curCol - drag.startCol) + 1,
      map_h: Math.abs(drag.curRow - drag.startRow) + 1,
    }
    const others = layout.filter(r => r.id !== selectedId && r.map_x != null && r.map_w > 0)
    if (others.some(o => overlaps(rect, o))) {
      toast.error('Өрөөнүүд давхцаж болохгүй')
      setDrag(null)
      return
    }
    setLayout(l => l.map(r => r.id === selectedId ? { ...r, ...rect } : r))
    setDirty(true)
    setDrag(null)
  }

  const clearPlacement = (id) => {
    setLayout(l => l.map(r => r.id === id ? { ...r, map_x: null, map_y: null, map_w: null, map_h: null } : r))
    setDirty(true)
  }

  const saveLayout = async () => {
    try {
      await roomsApi.saveLayout(layout.map(r => ({
        id: r.id, map_x: r.map_x, map_y: r.map_y, map_w: r.map_w, map_h: r.map_h,
      })))
      toast.success('Зураглал хадгалагдлаа')
      fetch()
    } catch {}
  }

  const typeOf = (id) => types.find(t => t.id === id)
  const dragRect = drag && {
    x: Math.min(drag.startCol, drag.curCol),
    y: Math.min(drag.startRow, drag.curRow),
    w: Math.abs(drag.curCol - drag.startCol) + 1,
    h: Math.abs(drag.curRow - drag.startRow) + 1,
  }

  return (
    <div className="p-4 space-y-5">
      {/* ── Өрөөний жагсаалт ── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-gray-800">Шүршүүрийн өрөө</h2>
            <p className="text-xs text-gray-500">
              {rooms.length} өрөө · {layout.filter(r => r.map_x != null).length} байрлуулсан
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                       rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> Өрөө нэмэх
          </button>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {rooms.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Өрөө алга. {types.length === 0 && 'Эхлээд «Өрөөний төрөл» табаас төрөл нэмнэ үү.'}
            </div>
          ) : (
            <div className="divide-y">
              {rooms.map(row => {
                const placed = layout.find(l => l.id === row.id)?.map_x != null
                return (
                  <div key={row.id} className="p-3 flex items-center gap-3">
                    <span className="w-3 h-8 rounded-full shrink-0"
                      style={{ background: typeOf(row.room_type_id)?.color || '#cbd5e1' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">№{row.number}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {row.room_type?.name || '—'}
                        {!row.is_active && <span className="text-gray-400"> · Идэвхгүй</span>}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0
                                      ${placed ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      {placed ? 'Байрлуулсан' : 'Байрлуулаагүй'}
                    </span>
                    <RowActions row={row} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Зураглалын editor ── */}
      {rooms.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="font-bold text-gray-800">Зураглал</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MousePointerClick className="w-3 h-3" />
                Өрөө сонгоод торон дээр чирж тэгш өнцөгт зурна
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetch} disabled={!dirty}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600
                           hover:bg-gray-50 disabled:opacity-40">
                Болих
              </button>
              <button onClick={saveLayout} disabled={!dirty}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2
                           rounded-xl text-sm font-medium disabled:opacity-40">
                <Save className="w-4 h-4" /> Хадгалах
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Өрөө сонгох жагсаалт */}
            <div className="lg:col-span-1 bg-white rounded-2xl border p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
              <p className="text-xs font-semibold text-gray-500 mb-1">Өрөө сонгох</p>
              {layout.map(r => {
                const placed = r.map_x != null
                return (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSel(selectedId === r.id ? null : r.id)}
                      className={`flex-1 text-left px-3 py-2 rounded-xl text-sm transition-all border
                                  ${selectedId === r.id
                                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                                    : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <span>№{r.number}</span>
                      {!placed && <span className="text-xs text-amber-600 ml-1.5">байрлуулаагүй</span>}
                    </button>
                    {placed && (
                      <button onClick={() => clearPlacement(r.id)} title="Байршил арилгах"
                        className="p-1.5 rounded-lg hover:bg-red-50">
                        <Eraser className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Grid */}
            <div className="lg:col-span-3">
              <div
                ref={gridRef}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setDrag(null)}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                className={`relative w-full rounded-xl border-2 bg-gray-50 overflow-hidden select-none touch-none
                            ${selectedId ? 'border-blue-300 cursor-crosshair' : 'border-gray-200'}`}
                style={{
                  aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
                  backgroundImage:
                    `linear-gradient(to right,  rgba(0,0,0,.07) 1px, transparent 1px),
                     linear-gradient(to bottom, rgba(0,0,0,.07) 1px, transparent 1px)`,
                  backgroundSize: `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
                }}
              >
                {layout.filter(r => r.map_x != null && r.map_w > 0).map(r => (
                  <div
                    key={r.id}
                    style={{
                      left:   `${(r.map_x / GRID_COLS) * 100}%`,
                      top:    `${(r.map_y / GRID_ROWS) * 100}%`,
                      width:  `${(r.map_w / GRID_COLS) * 100}%`,
                      height: `${(r.map_h / GRID_ROWS) * 100}%`,
                      background: `${typeOf(r.room_type_id)?.color || '#cbd5e1'}22`,
                      borderColor: typeOf(r.room_type_id)?.color || '#cbd5e1',
                    }}
                    className={`absolute rounded-lg border-2 flex flex-col items-center justify-center
                                text-xs font-bold text-gray-700 overflow-hidden
                                ${selectedId === r.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  >
                    <span>№{r.number}</span>
                    <span className="text-[10px] font-normal text-gray-500 truncate max-w-full px-1">
                      {r.room_type?.name}
                    </span>
                  </div>
                ))}

                {dragRect && (
                  <div
                    style={{
                      left:   `${(dragRect.x / GRID_COLS) * 100}%`,
                      top:    `${(dragRect.y / GRID_ROWS) * 100}%`,
                      width:  `${(dragRect.w / GRID_COLS) * 100}%`,
                      height: `${(dragRect.h / GRID_ROWS) * 100}%`,
                    }}
                    className="absolute rounded-lg border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
                  />
                )}

                {!selectedId && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
                    Зүүн талаас өрөө сонгоно уу
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Өрөө засах' : 'Шинэ өрөө нэмэх'}
          onClose={() => setShow(false)}
          onSubmit={handleSubmit}
          submitLabel={editing ? 'Хадгалах' : 'Нэмэх'}
        >
          <Field label="Өрөөний дугаар *">
            <input className="input" placeholder="1" value={form.number}
              onChange={e => setForm({ ...form, number: e.target.value })} />
          </Field>
          <Field label="Төрөл *">
            <select className="input" value={form.room_type_id}
              onChange={e => setForm({ ...form, room_type_id: e.target.value })}>
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.duration_min}мин
                </option>
              ))}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  CouponsTab – Купон удирдлага
// ══════════════════════════════════════════════════════════
function CouponsTab() {
  const [coupons, setCoupons] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    code: '', discount_type: 'percent', discount_value: '',
    min_amount: '', max_uses: '', expires_at: ''
  })

  const load = () => ordersApi.listCoupons().then(r => setCoupons(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setForm({ code: '', discount_type: 'percent', discount_value: '', min_amount: '', max_uses: '', expires_at: '' })
    setEditing(null)
    setShowForm(false)
  }

  const openEdit = (c) => {
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_amount: c.min_amount || '',
      max_uses: c.max_uses || '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : '',
    })
    setEditing(c)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.code || !form.discount_value) return toast.error('Код болон хямдралын утга оруулна уу')
    const data = {
      code: form.code,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_amount: parseFloat(form.min_amount) || 0,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at || null,
    }
    try {
      if (editing) {
        await ordersApi.updateCoupon(editing.id, data)
        toast.success('Купон шинэчлэгдлээ')
      } else {
        await ordersApi.createCoupon(data)
        toast.success('Купон нэмэгдлээ')
      }
      resetForm()
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Алдаа')
    }
  }

  const toggle = async (c) => {
    await ordersApi.toggleCoupon(c.id)
    load()
    toast.success(c.is_active ? 'Купон идэвхгүй болгосон' : 'Купон идэвхжүүлсэн')
  }

  const remove = async (c) => {
    if (!confirm(`"${c.code}" купон устгах уу?`)) return
    await ordersApi.deleteCoupon(c.id)
    load()
    toast.success('Устгагдлаа')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Купон / Хямдрал</h2>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Нэмэх
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Купон код">
              <input value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="VIP20" />
            </Field>
            <Field label="Хямдрал төрөл">
              <select value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="percent">Хувь (%)</option>
                <option value="amount">Дүн (₮)</option>
              </select>
            </Field>
            <Field label={form.discount_type === 'percent' ? 'Хувь (%)' : 'Дүн (₮)'}>
              <input type="number" value={form.discount_value}
                onChange={e => setForm({...form, discount_value: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="20" />
            </Field>
            <Field label="Доод дүн (₮)">
              <input type="number" value={form.min_amount}
                onChange={e => setForm({...form, min_amount: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </Field>
            <Field label="Хэрэглэх тоо (хоосон=хязгааргүй)">
              <input type="number" value={form.max_uses}
                onChange={e => setForm({...form, max_uses: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="100" />
            </Field>
            <Field label="Дуусах огноо">
              <input type="datetime-local" value={form.expires_at}
                onChange={e => setForm({...form, expires_at: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save}
              className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">
              {editing ? 'Шинэчлэх' : 'Хадгалах'}
            </button>
            <button onClick={resetForm}
              className="bg-gray-100 text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-200">
              Болих
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {coupons.length === 0 && (
          <div className="text-center py-12 text-gray-400">Купон байхгүй байна</div>
        )}
        {coupons.map(c => (
          <div key={c.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between ${!c.is_active ? 'opacity-50' : ''}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg text-blue-700">{c.code}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {c.discount_type === 'percent' ? `${c.discount_value}% хямдрал` : `${c.discount_value.toLocaleString()}₮ хямдрал`}
                {c.min_amount > 0 && ` · Доод ${c.min_amount.toLocaleString()}₮`}
                {c.max_uses && ` · ${c.used_count}/${c.max_uses} ашигласан`}
                {c.expires_at && ` · Хүртэл: ${new Date(c.expires_at).toLocaleDateString()}`}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => toggle(c)} className="p-2 rounded-lg hover:bg-gray-100">
                {c.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
              </button>
              <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100">
                <Edit2 className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => remove(c)} className="p-2 rounded-lg hover:bg-red-50">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  PointsTab – Оноо тохиргоо
// ══════════════════════════════════════════════════════════
function PointsTab() {
  const [form, setForm] = useState({ points_enabled: true, points_earn_rate: 1.0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi.getPoints()
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    try {
      await settingsApi.updatePoints(form)
      toast.success('Оноо тохиргоо хадгалагдлаа')
    } catch {
      toast.error('Алдаа гарлаа')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Уншиж байна...</div>

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-4">Оноо хуримтлуулах тохиргоо</h2>

      <div className="bg-white rounded-xl border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <Field label="Оноо идэвхтэй эсэх">
            <button onClick={() => setForm({...form, points_enabled: !form.points_enabled})}
              className="flex items-center gap-2 mt-1">
              {form.points_enabled
                ? <ToggleRight className="w-8 h-8 text-green-600" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />}
              <span className={`text-sm font-semibold ${form.points_enabled ? 'text-green-700' : 'text-gray-400'}`}>
                {form.points_enabled ? 'Идэвхтэй' : 'Идэвхгүй'}
              </span>
            </button>
          </Field>
        </div>

        <Field label="Хуримтлуулах хувь (%)">
          <div className="flex items-center gap-3">
            <input type="number" step="0.1" min="0" max="100"
              value={form.points_earn_rate}
              onChange={e => setForm({...form, points_earn_rate: parseFloat(e.target.value) || 0})}
              className="w-32 border rounded-lg px-3 py-2 text-sm" />
            <span className="text-sm text-gray-500">% нийт дүнгээс</span>
          </div>
        </Field>

        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            <strong>Жишээ:</strong> Үйлчлүүлэгч 50,000₮ төлсөн бол{' '}
            <strong>{Math.round(50000 * form.points_earn_rate / 100).toLocaleString()} оноо</strong> хуримтлагдана.
            (1 оноо = 1₮)
          </p>
        </div>

        <button onClick={save}
          className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700">
          Хадгалах
        </button>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  BrandTab – Системийн нэр (байгууллагын брэнд)
// ══════════════════════════════════════════════════════════
function BrandTab() {
  const [form, setForm]       = useState({ brand_name: '', brand_short: '', brand_desc: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const setBrand = useBrandStore(s => s.setBrand)

  useEffect(() => {
    settingsApi.getBrand()
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.brand_name.trim()) return toast.error('Системийн нэр оруулна уу')
    setSaving(true)
    try {
      const { data } = await settingsApi.updateBrand(form)
      setForm(data)
      setBrand(data)                    // систем даяар шууд шинэчлэгдэнэ
      document.title = data.brand_name
      toast.success('Системийн нэр шинэчлэгдлээ')
    } catch {
      /* interceptor toast */
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Уншиж байна...</div>

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-1">Байгууллагын нэр</h2>
      <p className="text-xs text-gray-500 mb-4">
        Эдгээр нэр систем даяар хэрэглэгдэнэ — нэвтрэх хуудас, цэсний толгой,
        ТВ дэлгэц, хөтчийн таб, ээлжийн баримт
      </p>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <Field label="Системийн нэр (бүтэн) *">
          <input value={form.brand_name}
            onChange={e => setForm({ ...form, brand_name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Цэмбий Laundry угаалга" />
          <p className="text-xs text-gray-400 mt-1">Нэвтрэх хуудасны том гарчиг, ТВ дэлгэц, хөтчийн таб</p>
        </Field>

        <Field label="Богино нэр">
          <input value={form.brand_short}
            onChange={e => setForm({ ...form, brand_short: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Цэмбий" />
          <p className="text-xs text-gray-400 mt-1">Логоны хажуу болон утасны дээд хэсэгт (хоосон бол бүтэн нэр)</p>
        </Field>

        <Field label="Тайлбар">
          <input value={form.brand_desc}
            onChange={e => setForm({ ...form, brand_desc: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Угаалгын үйлчилгээний удирдлагын систем" />
          <p className="text-xs text-gray-400 mt-1">Нэвтрэх хуудасны дэд гарчиг</p>
        </Field>

        {/* Урьдчилан харах */}
        <div className="rounded-xl overflow-hidden border">
          <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="text-white text-xs">🧺</span>
              </div>
              <span className="text-white font-bold text-sm">
                {form.brand_short || form.brand_name || '—'}
              </span>
            </div>
            <div className="text-white text-2xl font-extrabold leading-tight break-words">
              {form.brand_name || '—'}
            </div>
            {form.brand_desc && (
              <div className="text-blue-200 text-sm mt-1">{form.brand_desc}</div>
            )}
          </div>
          <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">Нэвтрэх хуудсан дээр ингэж харагдана</p>
        </div>

        <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Кассын баримтын толгой хэсэг «Баримт» табаас тусад нь тохируулагдана.
          Тэнд хоосон үлдээвэл энэ системийн нэрийг ашиглана.
        </p>

        <button onClick={save} disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5
                     text-sm font-medium disabled:opacity-50">
          {saving ? 'Хадгалж байна...' : 'Хадгалах'}
        </button>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  ReceiptTab – Баримт загвар тохиргоо
// ══════════════════════════════════════════════════════════
function ReceiptTab() {
  const [form, setForm] = useState({
    shop_name: '', shop_desc: '', shop_phone: '', footer_text: '', footer_sub: ''
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi.getReceipt()
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    try {
      await settingsApi.updateReceipt(form)
      toast.success('Баримт тохиргоо хадгалагдлаа')
    } catch {
      toast.error('Алдаа гарлаа')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Уншиж байна...</div>

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-4">Баримт загвар тохиргоо</h2>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <Field label="Дэлгүүрийн нэр">
          <input value={form.shop_name} onChange={e => setForm({...form, shop_name: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ЦЭМБИЙ LAUNDRY" />
          <p className="text-xs text-gray-400 mt-1">
            Хоосон бол «Байгууллага» табын системийн нэрийг ашиглана
          </p>
        </Field>

        <Field label="Тайлбар">
          <input value={form.shop_desc} onChange={e => setForm({...form, shop_desc: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Угаалгын үйлчилгээ" />
        </Field>

        <Field label="Утасны дугаар">
          <input value={form.shop_phone} onChange={e => setForm({...form, shop_phone: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="9900-0000" />
        </Field>

        <Field label="Доод текст (Баярлалаа гэх мэт)">
          <input value={form.footer_text} onChange={e => setForm({...form, footer_text: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Баярлалаа!" />
        </Field>

        <Field label="Нэмэлт текст">
          <input value={form.footer_sub} onChange={e => setForm({...form, footer_sub: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Дахин ирнэ үү" />
        </Field>

        {/* Preview */}
        <div className="bg-gray-100 rounded-xl p-4 font-mono text-center text-sm space-y-1">
          <p className="font-black text-base">{form.shop_name || '...'}</p>
          <p className="font-bold">{form.shop_desc || '...'}</p>
          <p className="text-xs text-gray-500">Утас: {form.shop_phone || '...'}</p>
          <p className="text-xs text-gray-400 mt-2">- - - - - - - - - - -</p>
          <p className="font-black mt-1">★ {form.footer_text || '...'} ★</p>
          <p className="text-xs">{form.footer_sub || '...'}</p>
        </div>

        <button onClick={save}
          className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700">
          Хадгалах
        </button>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  SmsTab – SMS Gateway тохиргоо
// ══════════════════════════════════════════════════════════
function SmsTab() {
  const [form, setForm] = useState({
    sms_gateway_url: '', sms_gateway_username: '', sms_gateway_password: '',
    sms_enabled: true, sms_template: ''
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi.getSms()
      .then(r => { setForm(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    try {
      await settingsApi.updateSms(form)
      toast.success('SMS тохиргоо хадгалагдлаа')
    } catch {
      toast.error('Алдаа гарлаа')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Уншиж байна...</div>

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-4">SMS Gateway тохиргоо</h2>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Field label="SMS идэвхтэй эсэх">
            <button onClick={() => setForm({...form, sms_enabled: !form.sms_enabled})}
              className="flex items-center gap-2 mt-1">
              {form.sms_enabled
                ? <ToggleRight className="w-8 h-8 text-green-600" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />}
              <span className={`text-sm font-semibold ${form.sms_enabled ? 'text-green-700' : 'text-gray-400'}`}>
                {form.sms_enabled ? 'Идэвхтэй' : 'Идэвхгүй'}
              </span>
            </button>
          </Field>
        </div>

        <Field label="Gateway URL">
          <input value={form.sms_gateway_url}
            onChange={e => setForm({...form, sms_gateway_url: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="http://192.168.1.71:8080" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Хэрэглэгчийн нэр">
            <input value={form.sms_gateway_username}
              onChange={e => setForm({...form, sms_gateway_username: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="sms" />
          </Field>
          <Field label="Нууц үг">
            <input type="password" value={form.sms_gateway_password}
              onChange={e => setForm({...form, sms_gateway_password: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="••••••" />
          </Field>
        </div>

        <Field label="SMS загвар (Бэлэн болсон үед илгээнэ)">
          <textarea value={form.sms_template} rows={3}
            onChange={e => setForm({...form, sms_template: e.target.value})}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Таны угаалга бэлэн боллоо. Цэмбий өөртөө үйлчлэх угаалга" />
        </Field>

        <button onClick={save}
          className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-700">
          Хадгалах
        </button>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  Салбар — өгөгдөл нь салбар тус бүрд ТУСДАА хадгалагдана
// ══════════════════════════════════════════════════════════
function BranchesTab() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [form, setForm]       = useState(null)   // {id?, name, address, phone}
  const current = useBranchStore(s => s.branch)

  const load = () => {
    setLoading(true)
    branchesApi.list()
      .then(r => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    const name = (form.name || '').trim()
    if (!name) return toast.error('Салбарын нэрээ оруулна уу')
    setBusy(true)
    try {
      const body = { name, address: form.address || null, phone: form.phone || null }
      if (form.id) {
        await branchesApi.update(form.id, body)
        toast.success('Салбар шинэчлэгдлээ')
      } else {
        await branchesApi.create(body)
        toast.success('Шинэ салбар үүслээ')
      }
      setForm(null)
      load()
      useBranchStore.getState().fetchBranches()
    } catch { /* interceptor toast */ } finally { setBusy(false) }
  }

  const toggle = async (b) => {
    try {
      await branchesApi.update(b.id, { is_active: !b.is_active })
      load()
      useBranchStore.getState().fetchBranches()
    } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800">Салбарууд</h2>
          <p className="text-xs text-gray-400 mt-0.5 max-w-lg">
            Салбар бүр ӨӨРИЙН өгөгдлийн сантай — захиалга, үйлчлүүлэгч, бараа,
            кассчид тусдаа. Салбарт нэмсэн хэрэглэгч зөвхөн тэр салбартаа
            хүчинтэй. Админ, нягтлан бүх салбарт нэвтэрнэ.
          </p>
        </div>
        <button
          onClick={() => setForm({ name: '', address: '', phone: '' })}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white
                     text-sm font-semibold px-3.5 py-2 rounded-xl shrink-0"
        >
          <Plus className="w-4 h-4" /> Шинэ салбар
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-6">Уншиж байна...</p>
      ) : (
        <div className="space-y-2">
          {rows.map(b => (
            <div key={b.id}
                 className={`flex items-center gap-3 rounded-xl border p-3
                   ${b.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
              <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center
                               justify-center shrink-0">
                <Building2 className="w-5 h-5 text-blue-600" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 truncate">{b.name}</span>
                  {current?.code === b.code && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                     bg-blue-100 text-blue-700">одоо энд</span>
                  )}
                  {!b.is_active && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                     bg-gray-200 text-gray-500">хаалттай</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {[b.address, b.phone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button onClick={() => setForm({ id: b.id, name: b.name,
                                              address: b.address || '', phone: b.phone || '' })}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Засах">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => toggle(b)}
                      className="p-2 rounded-lg hover:bg-gray-100 shrink-0"
                      title={b.is_active ? 'Хаах' : 'Нээх'}>
                {b.is_active
                  ? <ToggleRight className="w-5 h-5 text-green-600" />
                  : <ToggleLeft  className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Салбарыг хаахад өгөгдөл нь устахгүй — файлдаа бүтэн хадгалагдана.
      </p>

      {form && (
        <Modal
          title={form.id ? 'Салбар засах' : 'Шинэ салбар'}
          onClose={() => setForm(null)}
          onSubmit={save}
          submitLabel={busy ? 'Хадгалж байна…' : 'Хадгалах'}
        >
          <Field label="Салбарын нэр">
            <TextInput value={form.name} autoFocus placeholder="Баянзүрх салбар"
                       onChange={v => setForm({ ...form, name: v })} />
          </Field>
          <Field label="Хаяг">
            <TextInput value={form.address} placeholder="Заавал биш"
                       onChange={v => setForm({ ...form, address: v })} />
          </Field>
          <Field label="Утас">
            <TextInput value={form.phone} placeholder="Заавал биш"
                       onChange={v => setForm({ ...form, phone: v })} />
          </Field>
          {!form.id && (
            <p className="text-xs text-gray-400">
              Шинэ салбар ХООСОН өгөгдлийн сантай үүснэ. Үйлчилгээ, бараа,
              кассчдаа тэр салбар руу нэвтэрч нэмнэ.
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════
//  Бүх салбарын хэрэглэгч — админ ба нягтлан
// ══════════════════════════════════════════════════════════
const GLOBAL_ROLE_LABEL = { admin: 'Админ', accountant: 'Нягтлан' }

function GlobalUsersTab() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [form, setForm]       = useState(null)
  const me = useAuthStore(s => s.user)

  const load = () => {
    setLoading(true)
    globalUsersApi.list()
      .then(r => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    const username = (form.username || '').trim()
    if (!form.id && (!username || !form.password)) {
      return toast.error('Нэвтрэх нэр, нууц үгээ оруулна уу')
    }
    setBusy(true)
    try {
      if (form.id) {
        await globalUsersApi.update(form.id, {
          full_name: form.full_name, role: form.role,
          ...(form.password ? { password: form.password } : {}),
        })
        toast.success('Шинэчлэгдлээ')
      } else {
        await globalUsersApi.create({
          username, full_name: form.full_name || username,
          password: form.password, role: form.role,
        })
        toast.success('Хэрэглэгч бүх салбарт нэмэгдлээ')
      }
      setForm(null)
      load()
    } catch { /* interceptor toast */ } finally { setBusy(false) }
  }

  const remove = async (u) => {
    if (!confirm(`«${u.full_name}»-г бүх салбараас устгах уу?`)) return
    try {
      await globalUsersApi.remove(u.id)
      toast.success('Устгалаа')
      load()
    } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800">Бүх салбарын хэрэглэгч</h2>
          <p className="text-xs text-gray-400 mt-0.5 max-w-lg">
            Эдгээр хэрэглэгч НЭГ бүртгэлээр бүх салбарт нэвтэрч, програм дотроос
            салбар сольж чадна. Кассчин, үйлчлэгчийг «Хэрэглэгч» цэснээс тухайн
            салбарт нь нэмнэ.
          </p>
        </div>
        <button
          onClick={() => setForm({ username: '', full_name: '', password: '',
                                   role: 'accountant' })}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white
                     text-sm font-semibold px-3.5 py-2 rounded-xl shrink-0"
        >
          <Plus className="w-4 h-4" /> Нэмэх
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-6">Уншиж байна...</p>
      ) : (
        <div className="space-y-2">
          {rows.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border
                                       border-gray-200 bg-white p-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${u.role === 'admin' ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                {u.role === 'admin'
                  ? <ShieldCheck className="w-5 h-5 text-amber-600" />
                  : <UserCog className="w-5 h-5 text-emerald-600" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 truncate">{u.full_name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${u.role === 'admin'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'}`}>
                    {GLOBAL_ROLE_LABEL[u.role] || u.role}
                  </span>
                  {u.username === me?.username && (
                    <span className="text-[10px] text-gray-400">(та)</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">{u.username}</p>
              </div>
              <button onClick={() => setForm({ id: u.id, username: u.username,
                                               full_name: u.full_name, role: u.role,
                                               password: '' })}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Засах">
                <Edit2 className="w-4 h-4" />
              </button>
              {u.username !== me?.username && (
                <button onClick={() => remove(u)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Устгах">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? 'Хэрэглэгч засах' : 'Бүх салбарын хэрэглэгч'}
          onClose={() => setForm(null)}
          onSubmit={save}
          submitLabel={busy ? 'Хадгалж байна…' : 'Хадгалах'}
        >
          {!form.id && (
            <Field label="Нэвтрэх нэр">
              <TextInput value={form.username} autoFocus placeholder="nyagtlan"
                         onChange={v => setForm({ ...form, username: v })} />
            </Field>
          )}
          <Field label="Бүтэн нэр">
            <TextInput value={form.full_name} placeholder="Овог Нэр"
                       onChange={v => setForm({ ...form, full_name: v })} />
          </Field>
          <Field label="Эрх">
            <select value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2
                               text-sm bg-gray-50">
              <option value="accountant">Нягтлан — санхүү, бараа, үйлчилгээ</option>
              <option value="admin">Админ — бүрэн эрх</option>
            </select>
          </Field>
          <Field label={form.id ? 'Шинэ нууц үг (хоосон бол хэвээр)' : 'Нууц үг'}>
            <TextInput value={form.password} type="password" placeholder="••••••••"
                       onChange={v => setForm({ ...form, password: v })} />
          </Field>
        </Modal>
      )}
    </div>
  )
}


/* Салбарын цонхнуудын энгийн текст оролт */
function TextInput({ value, onChange, placeholder, type = 'text', autoFocus }) {
  return (
    <input
      type={type}
      value={value || ''}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
    />
  )
}


// ══════════════════════════════════════════════════════════
//  Нөөшлөлт — бүх салбарын өгөгдлийг нэг ZIP файлд
// ══════════════════════════════════════════════════════════
const RESTORE_WORD = 'СЭРГЭЭХ'

const fmtSize = (b) => b >= 1048576
  ? `${(b / 1048576).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`

const fmtAge = (h) => {
  if (h == null) return 'нөөцлөөгүй байна'
  if (h < 1)  return `${Math.max(1, Math.round(h * 60))} минутын өмнө`
  if (h < 48) return `${Math.round(h)} цагийн өмнө`
  return `${Math.round(h / 24)} хоногийн өмнө`
}

function BackupTab() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [note, setNote]       = useState('')
  const [restore, setRestore] = useState(null)   // {name} эсвэл {file}
  const [confirm, setConfirm] = useState('')
  const fileRef = useRef(null)

  const load = () => {
    setLoading(true)
    backupApi.list()
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const conf = data?.config || {}

  const saveConf = async (patch) => {
    try {
      await backupApi.config({ ...conf, ...patch })
      load()
    } catch { /* interceptor toast */ }
  }

  const doCreate = async () => {
    setBusy(true)
    const id = toast.loading('Нөөцлөж байна…')
    try {
      const { data: bk } = await backupApi.create(note)
      toast.success(`Нөөц үүслээ — ${fmtSize(bk.bytes)}`, { id })
      setNote('')
      load()
    } catch {
      toast.dismiss(id)
    } finally { setBusy(false) }
  }

  const doDownload = async (name) => {
    const id = toast.loading('Татаж байна…')
    try {
      const { data: blob } = await backupApi.download(name)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Татагдлаа', { id })
    } catch { toast.dismiss(id) }
  }

  const doDelete = async (name) => {
    if (!confirm2(`«${name}» нөөцийг устгах уу?`)) return
    try {
      await backupApi.remove(name)
      toast.success('Устлаа')
      load()
    } catch {}
  }

  const doRestore = async () => {
    setBusy(true)
    const id = toast.loading('Сэргээж байна…')
    try {
      await backupApi.restore({ ...restore, confirm })
      toast.success('Сэргээгдлээ. Хуудас дахин ачаална.', { id, duration: 4000 })
      setRestore(null); setConfirm('')
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      toast.dismiss(id)
    } finally { setBusy(false) }
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (f) { setRestore({ file: f }); setConfirm('') }
    e.target.value = ''
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="font-bold text-gray-800">Нөөшлөлт</h2>
        <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
          БҮХ салбарын өгөгдлийг (захиалга, үйлчлүүлэгч, бараа, ээлж, тохиргоо)
          нэг ZIP файлд хуулна. Сервер ажиллаж байхад ч аюулгүй — өгөгдлийн
          сангийн албан ёсны хуулбарлах аргыг ашиглана.
        </p>
      </div>

      {/* Одоогийн байдал */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-blue-600">Сүүлийн нөөц</p>
          <p className="font-bold text-blue-800 mt-0.5">{fmtAge(data?.last_age_hours)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Хадгалагдсан</p>
          <p className="font-bold text-gray-800 mt-0.5">
            {data?.backups?.length ?? 0} ширхэг
          </p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <p className="text-xs text-emerald-600">Автомат</p>
          <p className="font-bold text-emerald-800 mt-0.5">
            {conf.auto_enabled ? `${conf.interval_hours} цаг тутам` : 'унтраалттай'}
          </p>
        </div>
      </div>

      {/* Гараар нөөцлөх */}
      <div className="rounded-xl border border-gray-200 p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Тэмдэглэл (заавал биш) — жишээ: «Үнэ өөрчлөхийн өмнө»"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <button onClick={doCreate} disabled={busy}
            className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700
                       disabled:opacity-60 text-white text-sm font-semibold
                       px-4 py-2 rounded-xl shrink-0">
            <DatabaseBackup className="w-4 h-4" /> Одоо нөөцлөх
          </button>
        </div>

        {/* Автомат тохиргоо */}
        <div className="flex items-center gap-3 flex-wrap text-sm pt-1 border-t border-gray-100">
          <button onClick={() => saveConf({ auto_enabled: !conf.auto_enabled })}
                  className="flex items-center gap-1.5 text-gray-600">
            {conf.auto_enabled
              ? <ToggleRight className="w-5 h-5 text-green-600" />
              : <ToggleLeft className="w-5 h-5 text-gray-400" />}
            Автомат нөөшлөлт
          </button>
          <label className="flex items-center gap-1.5 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <select value={conf.interval_hours ?? 24} disabled={!conf.auto_enabled}
                    onChange={e => saveConf({ interval_hours: Number(e.target.value) })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50">
              <option value={6}>6 цаг тутам</option>
              <option value={12}>12 цаг тутам</option>
              <option value={24}>Өдөр бүр</option>
              <option value={168}>7 хоног тутам</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-gray-500">
            <HardDrive className="w-3.5 h-3.5" />
            <select value={conf.keep ?? 14}
                    onChange={e => saveConf({ keep: Number(e.target.value) })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50">
              <option value={7}>7 хадгална</option>
              <option value={14}>14 хадгална</option>
              <option value={30}>30 хадгална</option>
              <option value={90}>90 хадгална</option>
            </select>
          </label>
          <button onClick={() => fileRef.current?.click()}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500
                       hover:text-gray-700">
            <Upload className="w-3.5 h-3.5" /> Файлаас сэргээх
          </button>
          <input ref={fileRef} type="file" accept=".zip" hidden onChange={pickFile} />
        </div>
      </div>

      {/* Жагсаалт */}
      {loading ? (
        <p className="text-center text-gray-400 py-6">Уншиж байна...</p>
      ) : !data?.backups?.length ? (
        <p className="text-center text-gray-400 py-6">Нөөц байхгүй байна</p>
      ) : (
        <div className="space-y-2">
          {data.backups.map(bk => (
            <div key={bk.name}
                 className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
              <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center
                               justify-center shrink-0">
                <DatabaseBackup className="w-5 h-5 text-blue-600" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">
                    {dayjs(bk.created_at).format('YYYY/MM/DD HH:mm')}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                   bg-gray-100 text-gray-500">
                    {fmtSize(bk.bytes)}
                  </span>
                  {bk.broken && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                     bg-red-100 text-red-600">эвдэрсэн</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {bk.note ? `${bk.note} · ` : ''}
                  {bk.branches?.length
                    ? bk.branches.map(x => `${x.name} (${x.orders})`).join(', ')
                    : bk.name}
                </p>
              </div>
              <button onClick={() => doDownload(bk.name)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Татах">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => { setRestore({ name: bk.name }); setConfirm('') }}
                      disabled={bk.broken}
                      className="p-2 rounded-lg hover:bg-amber-50 text-amber-600
                                 disabled:opacity-30" title="Энэ нөөцөөс сэргээх">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => doDelete(bk.name)}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Устгах">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Нөөц нь <b className="font-semibold">{data?.dir || 'backend/backups'}</b> хавтаст
        хадгалагдана. Компьютер эвдэрвэл хамт алдагдана — чухал нөөцөө татаж аваад
        USB эсвэл өөр газар хуулж байхыг зөвлөе.
      </p>

      {/* Сэргээх баталгаа */}
      {restore && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
             onClick={() => setRestore(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4
                            text-white rounded-t-2xl">
              <h3 className="font-bold flex items-center gap-2">
                <RotateCcw className="w-5 h-5" /> Нөөцөөс сэргээх
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                <b className="text-gray-900">
                  {restore.name || restore.file?.name}
                </b>{' '}
                нөөцөөс сэргээх гэж байна.
              </p>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <b>Анхаар:</b> БҮХ салбарын одоогийн өгөгдөл нөөц дэх өгөгдлөөр
                солигдоно. Нөөц авсны дараах бүх захиалга, өөрчлөлт устана.
                <br />
                <span className="text-red-600/80 text-xs">
                  Сэргээхийн өмнө одоогийн байдлын нөөц автоматаар үүснэ.
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Баталгаажуулахын тулд «{RESTORE_WORD}» гэж бичнэ үү
                </label>
                <input
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={RESTORE_WORD}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50
                             focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setRestore(null)}
                  className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm
                             font-medium text-gray-600 hover:bg-gray-100">
                  Болих
                </button>
                <button onClick={doRestore}
                  disabled={busy || confirm.trim().toUpperCase() !== RESTORE_WORD}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40
                             text-white rounded-xl py-2.5 text-sm font-bold">
                  {busy ? 'Сэргээж байна…' : 'Сэргээх'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* window.confirm-ийг нэрийн зөрчилгүйгээр дуудна */
const confirm2 = (msg) => window.confirm(msg)
