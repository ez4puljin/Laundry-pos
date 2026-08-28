import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, LogOut, Lock, PlayCircle, ShowerHead, WashingMachine, Store,
} from 'lucide-react'
import dayjs from 'dayjs'
import useAuthStore  from '../store/useAuthStore'
import useShiftStore from '../store/useShiftStore'
import useBrandStore from '../store/useBrandStore'
import ShiftReceiptModal from './ShiftReceiptModal'

/* Өөр касс ажиллаж байгаа эсэхийг байнга шалгана — тэр ээлжээ хаамагц
   энэ дэлгэц өөрөө нээгдэнэ. */
const POLL_MS = 20_000

const SCOPE_ICON = {
  laundry: WashingMachine,
  shower:  ShowerHead,
  master:  Store,
}

/** Кассын төрөл бүрд НЭГ ээлж. Ээлжгүй бол POS нээгдэхгүй. */
export default function ShiftGate({ children }) {
  const user     = useAuthStore(s => s.user)
  const logout   = useAuthStore(s => s.logout)
  const navigate = useNavigate()

  const state      = useShiftStore(s => s.state)
  const loading    = useShiftStore(s => s.loading)
  const busy       = useShiftStore(s => s.busy)
  const summary    = useShiftStore(s => s.summary)
  const refresh    = useShiftStore(s => s.refresh)
  const startShift = useShiftStore(s => s.startShift)
  const brandName  = useBrandStore(s => s.brand_name)

  const isCashier = user?.role === 'cashier'

  // Кассчин биш бол ээлжийн төлөв шаардлагагүй — сүлжээ дэмий чирэгдүүлэхгүй
  useEffect(() => {
    if (!isCashier) return
    refresh()
    const id = setInterval(() => refresh(true), POLL_MS)
    return () => clearInterval(id)
  }, [isCashier, refresh])

  const handleLogout = () => {
    useShiftStore.getState().reset()
    logout()
    navigate('/login', { replace: true })
  }

  if (!isCashier) return children

  // Тулгалтын баримт — ээлж хаасны дараа бүх зүйлээс дээгүүр гарна
  const receipt = summary
    ? <ShiftReceiptModal data={summary} onLogout={handleLogout} />
    : null

  if (loading && !state) {
    return (
      <Screen>
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="mt-4 text-gray-500 text-sm">Ээлжийн мэдээлэл ачаалж байна…</p>
      </Screen>
    )
  }

  // Кассчин боловч сервер ээлж шаардаагүй бол хаахгүй (аюулгүйн нөөц)
  if (state && state.requires_shift === false) return <>{children}{receipt}</>

  const ScopeIcon = SCOPE_ICON[state?.scope] || Store

  /* ── Өөр касс ажиллаж байна ── */
  if (state?.blocked_by) {
    const b = state.blocked_by
    return (
      <>
        <Screen>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 text-white text-center">
              <Lock className="w-10 h-10 mx-auto mb-2" />
              <h2 className="font-bold text-lg">Систем завгүй байна</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed text-center">
                <b className="text-gray-900">{b.user?.full_name || 'Өөр касс'}</b>{' '}
                <b className="text-gray-900">«{scopeLabel(b.scope)}»</b> кассын ээлж дээр
                ажиллаж байна. Нэг төрөл дээр зэрэг хоёр касс ажиллах боломжгүй.
              </p>
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1.5 text-sm">
                <Row label="Касс"     value={b.user?.full_name || '—'} />
                <Row label="Төрөл"    value={scopeLabel(b.scope)} />
                <Row label="Эхэлсэн"  value={dayjs(b.started_at).format('MM/DD HH:mm')} />
              </div>
              <p className="text-xs text-gray-400 text-center">
                Тэр ээлжээ хаамагц энэ дэлгэц өөрөө нээгдэнэ.
              </p>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-gray-800
                           hover:bg-gray-900 text-white font-bold py-3 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" /> Бүртгэлээс гарах
              </button>
            </div>
          </div>
        </Screen>
        {receipt}
      </>
    )
  }

  /* ── Ээлж нээгдээгүй ── */
  if (!state?.shift) {
    return (
      <>
        <Screen>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-5 text-white text-center">
              <ScopeIcon className="w-10 h-10 mx-auto mb-2" />
              <h2 className="font-bold text-lg">{brandName}</h2>
              <p className="text-blue-100 text-sm mt-0.5">{state?.scope_label} касс</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="font-bold text-gray-800">{user?.full_name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Ажил эхлэхийн тулд ээлжээ нээнэ үү
                </p>
              </div>
              <button
                onClick={startShift}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-blue-600
                           hover:bg-blue-700 disabled:opacity-60 text-white font-bold
                           py-3.5 rounded-xl transition-colors active:scale-[0.99]"
              >
                {busy
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <PlayCircle className="w-5 h-5" />}
                Ээлж эхлүүлэх
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-gray-500
                           hover:text-gray-700 text-sm font-medium py-2 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Бүртгэлээс гарах
              </button>
            </div>
          </div>
        </Screen>
        {receipt}
      </>
    )
  }

  /* ── Ээлж нээлттэй — ажиллана ── */
  return <>{children}{receipt}</>
}


export const scopeLabel = (s) =>
  ({ laundry: 'Угаалга', shower: 'Шүршүүр', master: 'Бүх касс' }[s] || s || '—')


function Screen({ children }) {
  return (
    <div className="fixed inset-0 z-[90] bg-gray-100 flex flex-col items-center justify-center p-4">
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-semibold text-gray-800 text-right truncate">{value}</span>
    </div>
  )
}
