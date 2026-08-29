import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react'
import useAuthStore   from '../store/useAuthStore'
import useBranchStore from '../store/useBranchStore'
import { branchesApi } from '../api/client'

/* ── Салбарын заалт / солигч ─────────────────────────────────
   · Салбарын дотоод хэрэглэгч — зөвхөн нэрийг ХАРНА
   · Глобал хэрэглэгч (админ, нягтлан) — жагсаалтаас солино,
     гарч дахин нэвтрэх шаардлагагүй
   ───────────────────────────────────────────────────────── */
export default function BranchSwitcher({ compact = false }) {
  const user     = useAuthStore(s => s.user)
  const setAuth  = useAuthStore(s => s.setAuth)
  const branch   = useBranchStore(s => s.branch)
  const switchTo = useBranchStore(s => s.switchTo)

  const [open, setOpen]   = useState(false)
  const [list, setList]   = useState([])
  const [busy, setBusy]   = useState(false)
  const boxRef = useRef(null)

  const canSwitch = !!user?.is_global

  // Цонх нээх бүрд шинэчилнэ — шинэ салбар нэмэгдсэн байж болно
  useEffect(() => {
    if (!canSwitch) return
    branchesApi.mine().then(r => setList(r.data || [])).catch(() => {})
  }, [canSwitch, open])

  // Гадуур дарахад хаана
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = async (b) => {
    if (b.code === branch?.code) return setOpen(false)
    setBusy(true)
    const data = await switchTo(b.code)
    setBusy(false)
    setOpen(false)
    if (data) {
      setAuth(data.user, data.access_token)
      // Бүх хуудасны өгөгдлийг шинэ салбараар дахин ачаална
      window.location.reload()
    }
  }

  const name = branch?.name || '—'

  /* Хажуугийн нарийн цэсэнд — зөвхөн богино нэр */
  if (compact) {
    return (
      <div ref={boxRef} className="relative w-16">
        <button
          onClick={() => canSwitch && setOpen(o => !o)}
          disabled={!canSwitch || busy}
          title={canSwitch ? `${name} — дарж салбар солино` : name}
          className={`w-full flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg
                      transition-colors ${canSwitch ? 'hover:bg-gray-700' : 'cursor-default'}`}
        >
          {busy
            ? <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            : <Building2 className="w-4 h-4 text-gray-400" />}
          <span className="text-gray-400 leading-tight text-center w-14 truncate"
                style={{ fontSize: '9px' }}>
            {name}
          </span>
        </button>

        {open && (
          <div className="absolute left-full bottom-0 ml-2 w-56 bg-white rounded-xl
                          shadow-2xl border border-gray-200 py-1.5 z-50">
            <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              Салбар сонгох
            </p>
            {list.map(b => (
              <button key={b.code} onClick={() => pick(b)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                           hover:bg-gray-50 transition-colors">
                <span className="flex-1 min-w-0 truncate text-gray-700">{b.name}</span>
                {b.code === branch?.code && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* Гар утасны толгойд */
  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        onClick={() => canSwitch && setOpen(o => !o)}
        disabled={!canSwitch || busy}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg max-w-[42vw]
                    ${canSwitch ? 'hover:bg-white/10' : 'cursor-default'}`}
      >
        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-gray-300 text-xs font-medium truncate">{name}</span>
        {canSwitch && <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl
                        shadow-2xl border border-gray-200 py-1.5 z-50">
          {list.map(b => (
            <button key={b.code} onClick={() => pick(b)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                         hover:bg-gray-50 transition-colors">
              <span className="flex-1 min-w-0 truncate text-gray-700">{b.name}</span>
              {b.code === branch?.code && (
                <Check className="w-4 h-4 text-blue-600 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
