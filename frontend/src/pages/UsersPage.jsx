import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, KeyRound,
  ShieldCheck, User, CheckCircle2, XCircle,
  Loader2, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi } from '../api/client'
import useAuthStore from '../store/useAuthStore'

const MODAL = { NONE: 0, CREATE: 1, EDIT: 2, RESET_PW: 3, DELETE: 4 }

const RoleBadge = ({ role }) =>
  role === 'admin' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                     bg-yellow-100 text-yellow-700 border border-yellow-200">
      <ShieldCheck className="w-3 h-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                     bg-blue-100 text-blue-700 border border-blue-200">
      <User className="w-3 h-3" /> Кассчин
    </span>
  )

export default function UsersPage() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState({ type: MODAL.NONE, user: null })
  const [form,    setForm]    = useState({ username: '', full_name: '', password: '', role: 'cashier' })
  const [newPw,   setNewPw]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const me = useAuthStore(s => s.user)

  const fetchUsers = async () => {
    try {
      const res = await usersApi.list()
      setUsers(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  /* ── Modal openers ───────────────────────────────── */
  const openCreate = () => {
    setForm({ username: '', full_name: '', password: '', role: 'cashier' })
    setModal({ type: MODAL.CREATE, user: null })
  }

  const openEdit = (user) => {
    setForm({ full_name: user.full_name, role: user.role, is_active: user.is_active })
    setModal({ type: MODAL.EDIT, user })
  }

  const openReset = (user) => {
    setNewPw('')
    setModal({ type: MODAL.RESET_PW, user })
  }

  const openDelete = (user) => setModal({ type: MODAL.DELETE, user })
  const close      = ()     => setModal({ type: MODAL.NONE, user: null })

  /* ── Actions ─────────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.username.trim() || !form.full_name.trim() || !form.password)
      return toast.error('Бүх талбарыг бөглөнө үү')
    if (form.password.length < 4)
      return toast.error('Нууц үг хамгийн багадаа 4 тэмдэгт')
    setSaving(true)
    try {
      await usersApi.create(form)
      toast.success('Хэрэглэгч нэмэгдлээ')
      close(); fetchUsers()
    } catch (_) {}
    finally { setSaving(false) }
  }

  const handleEdit = async () => {
    setSaving(true)
    try {
      await usersApi.update(modal.user.id, {
        full_name: form.full_name,
        role:      form.role,
        is_active: form.is_active,
      })
      toast.success('Хэрэглэгч шинэчлэгдлээ')
      close(); fetchUsers()
    } catch (_) {}
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!newPw || newPw.length < 4)
      return toast.error('Нууц үг хамгийн багадаа 4 тэмдэгт')
    setSaving(true)
    try {
      await usersApi.resetPassword(modal.user.id, newPw)
      toast.success('Нууц үг шинэчлэгдлээ')
      close()
    } catch (_) {}
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await usersApi.remove(modal.user.id)
      toast.success('Хэрэглэгч устгагдлаа')
      close(); fetchUsers()
    } catch (_) {}
    finally { setSaving(false) }
  }

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="flex-1 overflow-auto p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">Хэрэглэгч</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700
                     text-white text-xs font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Нэмэх
        </button>
      </div>

      {/* User cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {users.map(u => (
            <div key={u.id} className="bg-white rounded-xl border p-3.5 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm
                              bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-sm">
                {u.full_name.slice(0, 2).toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm truncate">{u.full_name}</p>
                  {u.id === me?.id && <span className="text-[10px] text-blue-500 font-medium">(та)</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-gray-400 text-xs">{u.username}</span>
                  <RoleBadge role={u.role} />
                  {!u.is_active && (
                    <span className="text-[10px] text-red-400 font-medium">Идэвхгүй</span>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => openReset(u)}
                  className="p-2 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500" title="Нууц үг">
                  <KeyRound className="w-4 h-4" />
                </button>
                <button onClick={() => openEdit(u)}
                  className="p-2 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Засах">
                  <Pencil className="w-4 h-4" />
                </button>
                {u.id !== me?.id && (
                  <button onClick={() => openDelete(u)}
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500" title="Устгах">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Хэрэглэгч байхгүй байна</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────── */}
      {modal.type !== MODAL.NONE && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50
                        flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
               onClick={e => e.stopPropagation()}>

            {/* ── CREATE ── */}
            {modal.type === MODAL.CREATE && (
              <>
                <ModalHeader title="Хэрэглэгч нэмэх" onClose={close} />
                <div className="space-y-4 mt-5">
                  <Field label="Нэвтрэх нэр">
                    <input
                      className={inputCls}
                      placeholder="john.doe"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                    />
                  </Field>
                  <Field label="Бүтэн нэр">
                    <input
                      className={inputCls}
                      placeholder="Нэр"
                      value={form.full_name}
                      onChange={e => setForm({ ...form, full_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Нууц үг">
                    <input
                      type="password"
                      className={inputCls}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                    />
                  </Field>
                  <Field label="Эрх">
                    <RoleSelect value={form.role} onChange={v => setForm({ ...form, role: v })} />
                  </Field>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={close} className={cancelBtnCls}>Болих</button>
                  <button onClick={handleCreate} disabled={saving} className={primaryBtnCls}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Нэмэх
                  </button>
                </div>
              </>
            )}

            {/* ── EDIT ── */}
            {modal.type === MODAL.EDIT && (
              <>
                <ModalHeader title={`Засах — ${modal.user.username}`} onClose={close} />
                <div className="space-y-4 mt-5">
                  <Field label="Бүтэн нэр">
                    <input
                      className={inputCls}
                      value={form.full_name}
                      onChange={e => setForm({ ...form, full_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Эрх">
                    <RoleSelect
                      value={form.role}
                      onChange={v => setForm({ ...form, role: v })}
                      disabled={modal.user.id === me?.id}
                    />
                  </Field>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-blue-600"
                      checked={form.is_active}
                      onChange={e => setForm({ ...form, is_active: e.target.checked })}
                      disabled={modal.user.id === me?.id}
                    />
                    <span className="text-sm font-medium text-gray-700">Идэвхтэй</span>
                  </label>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={close} className={cancelBtnCls}>Болих</button>
                  <button onClick={handleEdit} disabled={saving} className={primaryBtnCls}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Хадгалах
                  </button>
                </div>
              </>
            )}

            {/* ── RESET PASSWORD ── */}
            {modal.type === MODAL.RESET_PW && (
              <>
                <ModalHeader title={`Нууц үг — ${modal.user.username}`} onClose={close} />
                <p className="text-sm text-gray-500 mt-1 mb-5">
                  Шинэ нууц үг тохируулна уу
                </p>
                <Field label="Шинэ нууц үг">
                  <input
                    type="password"
                    className={inputCls}
                    placeholder="Хамгийн багадаа 4 тэмдэгт"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    autoFocus
                  />
                </Field>
                <div className="flex gap-3 mt-6">
                  <button onClick={close} className={cancelBtnCls}>Болих</button>
                  <button onClick={handleReset} disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5
                                     bg-orange-500 hover:bg-orange-600 text-white text-sm
                                     font-semibold rounded-xl transition-colors disabled:opacity-60">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Шинэчлэх
                  </button>
                </div>
              </>
            )}

            {/* ── DELETE ── */}
            {modal.type === MODAL.DELETE && (
              <>
                <ModalHeader title="Хэрэглэгч устгах" onClose={close} />
                <p className="text-sm text-gray-600 mt-3 mb-6">
                  <span className="font-semibold text-gray-900">{modal.user.full_name}</span>
                  {' '}(
                  <span className="font-mono">{modal.user.username}</span>
                  ) хэрэглэгчийг устгах уу? Энэ үйлдлийг буцаах боломжгүй.
                </p>
                <div className="flex gap-3">
                  <button onClick={close} className={cancelBtnCls}>Болих</button>
                  <button onClick={handleDelete} disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5
                                     bg-red-500 hover:bg-red-600 text-white text-sm
                                     font-semibold rounded-xl transition-colors disabled:opacity-60">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Устгах
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Small helper components ─────────────────────────── */
const inputCls = `w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  focus:bg-white transition`

const primaryBtnCls = `flex-1 flex items-center justify-center gap-2 py-2.5
                        bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                        rounded-xl transition-colors disabled:opacity-60`

const cancelBtnCls = `flex-1 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50
                       text-sm font-semibold rounded-xl transition-colors`

function ModalHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function RoleSelect({ value, onChange, disabled = false }) {
  return (
    <div className="flex gap-3">
      {['cashier', 'admin'].map(r => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all
            ${value === r
              ? r === 'admin'
                ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                : 'bg-blue-50 border-blue-300 text-blue-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {r === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
          {r === 'admin' ? 'Admin' : 'Кассчин'}
        </button>
      ))}
    </div>
  )
}
