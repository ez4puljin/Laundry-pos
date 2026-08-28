import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import {
  ShieldAlert, ShieldCheck, KeyRound, Loader2, Copy, Check,
  Clock, Lock, Eye, EyeOff,
} from 'lucide-react'
import useBrandStore from '../store/useBrandStore'

/** Хэвийн ажиллаж байгаа төлөв */
const OK = 'active'

/** Түгжигдсэн шалтгаан бүрийн гарчиг */
const TITLES = {
  unlicensed: 'Систем идэвхжүүлээгүй байна',
  expired:    'Туршилтын хугацаа дууслаа',
  tampered:   'Системийн цаг өөрчлөгдсөн байна',
  mismatch:   'Энэ эрх өөр компьютерийнх',
  broken:     'Лицензийн тохиргоо дутуу байна',
}

const CHECK_INTERVAL = 60_000

export default function LicenseGate({ children }) {
  const [lic,     setLic]     = useState(null)   // null = хараахан шалгаагүй
  const [ready,   setReady]   = useState(false)
  const [mode,    setMode]    = useState('trial')
  const [days,    setDays]    = useState(30)
  const [tab,     setTab]     = useState('password')
  const [pw,      setPw]      = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [key,     setKey]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)
  const brandName = useBrandStore(s => s.brand_name)

  const refresh = useCallback(async () => {
    try {
      const res = await axios.get('/api/license/status')
      setLic(res.data)
    } catch (_) {
      // Сервер унтарсан үед хуучин төлөвөө хадгална
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, CHECK_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  // Хязгаарлалтын тоолуур
  useEffect(() => {
    if (!lic?.retry_after) return
    const id = setInterval(
      () => setLic(prev => (prev ? { ...prev, retry_after: Math.max(0, prev.retry_after - 1) } : prev)),
      1000,
    )
    return () => clearInterval(id)
  }, [lic?.retry_after])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = tab === 'key'
        ? { key: key.trim(), mode: 'trial', days: 1 }
        : { password: pw, mode, days: mode === 'trial' ? Number(days) || 1 : 1 }
      const res = await axios.post('/api/license/activate', body)
      setLic(res.data)
      setPw(''); setKey('')
      if (res.data.ok) setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setError(err.response?.data?.detail || 'Эрх нээхэд алдаа гарлаа')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lic?.machine_code || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (_) { /* clipboard хаалттай байж болно */ }
  }

  // Эхний шалгалт дуустал хоосон дэлгэц (анивчихаас сэргийлнэ)
  if (!ready) return null

  // Сервертэй холбогдож чадаагүй бол апп-аа хаахгүй — backend өөрөө хамгаална
  if (!lic) return children

  if (lic.state === OK) {
    return (
      <>
        {children}
        <TrialBanner lic={lic} />
      </>
    )
  }

  const waiting = lic.retry_after > 0

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800
                    to-slate-900 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">

          {/* Толгой */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/15
                            border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {TITLES[lic.state] || 'Систем түгжигдсэн байна'}
            </h1>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              {lic.message || 'Үргэлжлүүлэхийн тулд эрх нээх шаардлагатай.'}
            </p>
          </div>

          <div className="bg-slate-800/60 backdrop-blur border border-slate-700
                          rounded-2xl p-6 shadow-2xl">

            {/* Машины код */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-400 mb-2">
                МАШИНЫ КОД — эрх нээлгэхдээ энэ кодыг илгээнэ үү
              </label>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-700
                                 rounded-lg text-[11px] sm:text-xs text-emerald-400
                                 font-mono break-all leading-relaxed">
                  {lic.machine_code || '—'}
                </code>
                <button
                  type="button"
                  onClick={copyCode}
                  title="Хуулах"
                  className="px-3 shrink-0 bg-slate-700 hover:bg-slate-600 rounded-lg
                             text-slate-300 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Таб сонголт */}
            <div className="flex gap-1 p-1 bg-slate-900/70 rounded-xl mb-5">
              {[
                { id: 'password', label: 'Мастер нууц үг', icon: Lock },
                { id: 'key',      label: 'Идэвхжүүлэх түлхүүр', icon: KeyRound },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2
                              rounded-lg text-xs font-medium transition-all
                              ${tab === id
                                ? 'bg-blue-600 text-white shadow'
                                : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">

              {tab === 'password' ? (
                <>
                  {/* Эрхийн төрөл */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      ЭРХИЙН ТӨРӨЛ
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMode('trial')}
                        className={`py-2.5 px-3 rounded-lg text-xs font-medium border transition-all
                                    ${mode === 'trial'
                                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                      : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                      >
                        Хугацаатай
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('full')}
                        className={`py-2.5 px-3 rounded-lg text-xs font-medium border transition-all
                                    ${mode === 'full'
                                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                      : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                      >
                        Бүрэн (хугацаагүй)
                      </button>
                    </div>
                  </div>

                  {mode === 'trial' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        ХЭДЭН ХОНОГ
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={days}
                        onChange={e => setDays(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700
                                   rounded-lg text-sm text-white
                                   focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                      МАСТЕР НУУЦ ҮГ
                    </label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={pw}
                        onChange={e => setPw(e.target.value)}
                        autoFocus
                        placeholder="••••••••••••"
                        className="w-full px-4 py-2.5 pr-11 bg-slate-900 border border-slate-700
                                   rounded-lg text-sm text-white placeholder-slate-600
                                   focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-slate-500 hover:text-slate-300"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    ИДЭВХЖҮҮЛЭХ ТҮЛХҮҮР
                  </label>
                  <textarea
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    autoFocus
                    rows={4}
                    placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-..."
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700
                               rounded-lg text-xs text-white font-mono placeholder-slate-600
                               focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    Дээрх машины кодыг үйлчилгээ үзүүлэгч рүү илгээж, хариуд нь
                    ирсэн түлхүүрийг энд буулгана уу.
                  </p>
                </div>
              )}

              {error && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30
                                rounded-lg text-xs text-red-300">
                  {error}
                </div>
              )}

              {waiting && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10
                                border border-amber-500/30 rounded-lg text-xs text-amber-300">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Хэт олон буруу оролдлого — {lic.retry_after} секунд хүлээнэ үү
                </div>
              )}

              <button
                type="submit"
                disabled={busy || waiting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.99]
                           text-white font-semibold rounded-xl text-sm transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
              >
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Шалгаж байна...</>
                  : <><ShieldCheck className="w-4 h-4" /> Эрх нээх</>}
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-slate-600 mt-5">
            {brandName}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Хугацаа дуусах гэж байгаа үед доод буланд сэрэмжлүүлэг */
function TrialBanner({ lic }) {
  const [hidden, setHidden] = useState(false)
  if (hidden || lic.mode !== 'trial' || lic.days_left > 7) return null

  const urgent = lic.days_left <= 3
  return (
    <div
      /* Хажуугийн цэсний доод товчнууд (Дуусгах / Гарах) болон гар утасны
         доод навигацийг халхлахгүй байрлал */
      className={`fixed bottom-20 left-4 md:bottom-4 md:left-24
                  z-[9998] flex items-center gap-2.5 px-4 py-2.5
                  rounded-xl shadow-lg border text-xs font-medium backdrop-blur
                  ${urgent
                    ? 'bg-red-50/95 border-red-200 text-red-700'
                    : 'bg-amber-50/95 border-amber-200 text-amber-800'}`}
    >
      <Clock className="w-4 h-4 shrink-0" />
      <span>
        Туршилтын хугацаа дуусахад <b>{lic.days_left}</b> хоног үлдлээ
      </span>
      <button
        onClick={() => setHidden(true)}
        className="ml-1 opacity-50 hover:opacity-100 text-sm leading-none"
        title="Хаах"
      >
        ✕
      </button>
    </div>
  )
}
