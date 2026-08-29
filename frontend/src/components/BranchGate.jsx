import { useEffect } from 'react'
import { Building2, ChevronRight, Loader2, MapPin } from 'lucide-react'
import useAuthStore   from '../store/useAuthStore'
import useBranchStore from '../store/useBranchStore'
import useBrandStore  from '../store/useBrandStore'

/* ── Салбар сонгох дэлгэц ────────────────────────────────────
   Нэвтрээгүй үед ЭХЛЭЭД салбараа сонгоно, дараа нь нэвтрэх
   хуудас (тухайн салбарын нэртэй) гарна.

   · Ганцхан салбартай бол сонгуулахгүй — шууд нэвтрэх хуудас
   · Нэвтэрсэн хэрэглэгчийн салбар нь токенд байгаа тул хаана ч биш
   ───────────────────────────────────────────────────────── */
export default function BranchGate({ children }) {
  const token    = useAuthStore(s => s.token)
  const branch   = useBranchStore(s => s.branch)
  const branches = useBranchStore(s => s.branches)
  const loading  = useBranchStore(s => s.loading)
  const fetchBranches = useBranchStore(s => s.fetchBranches)
  const select   = useBranchStore(s => s.select)
  const brandName  = useBrandStore(s => s.brand_name)
  const brandShort = useBrandStore(s => s.brand_short)

  // Нэвтрээгүй үед л жагсаалт татна — нэвтэрсэн бол салбар нь тодорхой
  useEffect(() => {
    if (token) return
    fetchBranches().then(list => {
      // ТВ дэлгэц гэх мэт тогтмол цэгт  ?branch=<код>  гэж өгч болно
      const want = new URLSearchParams(window.location.search).get('branch')
      const hit  = want && (list || []).find(b => b.code === want)
      if (hit) select(hit)
    })
  }, [token, fetchBranches, select])

  if (token || branch) return children

  if (loading && branches.length === 0) {
    return (
      <Screen>
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="mt-4 text-gray-500 text-sm">Салбаруудыг ачаалж байна…</p>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br
                          from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
            <Building2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{brandName || brandShort}</h1>
          <p className="text-gray-400 text-sm mt-1">Ажиллах салбараа сонгоно уу</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
          {branches.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">
              Салбар бүртгэгдээгүй байна.<br />
              Сервер ачаалж дуусахыг хүлээнэ үү.
            </p>
          ) : branches.map(b => (
            <button
              key={b.code}
              onClick={() => select(b)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2
                         border-gray-200 bg-white text-left transition-all
                         hover:border-blue-400 hover:bg-blue-50/50 active:scale-[0.99]"
            >
              <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center
                               justify-center shrink-0">
                <Building2 className="w-5 h-5 text-blue-600" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-gray-800 truncate">{b.name}</span>
                {b.address && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 truncate">
                    <MapPin className="w-3 h-3 shrink-0" /> {b.address}
                  </span>
                )}
              </span>
              <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </Screen>
  )
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      {children}
    </div>
  )
}
