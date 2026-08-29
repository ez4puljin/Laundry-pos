import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WashingMachine, Loader2, Eye, EyeOff, Building2, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'
import useAuthStore from '../store/useAuthStore'
import useBrandStore from '../store/useBrandStore'
import useBranchStore from '../store/useBranchStore'
import { homeFor } from '../components/ProtectedRoute'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)

  const navigate   = useNavigate()
  const brandName  = useBrandStore(s => s.brand_name)
  const brandShort = useBrandStore(s => s.brand_short)
  const brandDesc  = useBrandStore(s => s.brand_desc)
  const setAuth  = useAuthStore(s => s.setAuth)
  const branch      = useBranchStore(s => s.branch)
  const branchCount = useBranchStore(s => s.branches.length)
  const clearBranch = useBranchStore(s => s.clear)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      return toast.error('Нэвтрэх нэр болон нууц үгээ оруулна уу')
    }
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/login', {
        username: username.trim(),
        password,
      }, branch ? { headers: { 'X-Branch': branch.code } } : undefined)
      setAuth(res.data.user, res.data.access_token)
      // Сервер аль салбарт нэвтэрснийг баталгаажуулж буцаана
      if (res.data.branch_code) {
        useBranchStore.getState().select({
          id:   branch?.id ?? 0,
          code: res.data.branch_code,
          name: res.data.branch_name || branch?.name || '',
          address: branch?.address ?? null,
        })
      }
      toast.success(`Тавтай морил, ${res.data.user.full_name}!`)
      navigate(homeFor(res.data.user.role), { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Нэвтрэх нэр эсвэл нууц үг буруу байна'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left branding panel (lg+) ───────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-1/2
                      bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-12 select-none">
        {/* Top logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl
                          flex items-center justify-center shadow-lg">
            <WashingMachine className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-wide">{brandShort}</span>
        </div>

        {/* Center headline */}
        <div>
          <h1 className="text-5xl font-extrabold text-white mb-4 leading-tight break-words">
            {brandName}
          </h1>
          {brandDesc && (
            <p className="text-blue-200 text-lg leading-relaxed">{brandDesc}</p>
          )}
        </div>

        {/* Bottom badges */}
        <div className="flex gap-5 text-blue-200 text-sm font-medium">
          <span className="bg-white/10 rounded-full px-3 py-1">🧼 Угаалга</span>
          <span className="bg-white/10 rounded-full px-3 py-1">🧺 Хуурай цэвэрлэгээ</span>
          <span className="bg-white/10 rounded-full px-3 py-1">🔆 Индүүдэх</span>
        </div>
      </div>

      {/* ── Right login panel ───────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center
                      p-6 sm:p-8 bg-gray-50">

        {/* Mobile: logo + title */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center
                          justify-center mb-4 shadow-lg">
            <WashingMachine className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            {brandName}
          </h1>
          <p className="text-gray-400 text-sm mt-1">Удирдлагын систем</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

            <h2 className="text-2xl font-bold text-gray-900 mb-1">Нэвтрэх</h2>
            <p className="text-gray-400 text-sm mb-4">
              Системд нэвтрэхийн тулд мэдээллээ оруулна уу
            </p>

            {/* Аль салбарт нэвтэрч байгаа нь */}
            {branch && (
              <div className="flex items-center gap-2.5 mb-6 px-3 py-2.5 rounded-xl
                              bg-blue-50 border border-blue-100">
                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-blue-900 truncate">
                    {branch.name}
                  </span>
                  {branch.address && (
                    <span className="block text-xs text-blue-500 truncate">
                      {branch.address}
                    </span>
                  )}
                </span>
                {branchCount > 1 && (
                  <button
                    type="button"
                    onClick={clearBranch}
                    className="shrink-0 flex items-center gap-0.5 text-xs font-medium
                               text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Солих
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Нэвтрэх нэр
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm
                             bg-gray-50 placeholder-gray-400 transition
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             focus:border-transparent focus:bg-white"
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Нууц үг
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm
                               bg-gray-50 placeholder-gray-400 transition
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               focus:border-transparent focus:bg-white"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2
                               text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98]
                           text-white font-semibold rounded-xl text-sm transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2 shadow-sm mt-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            © {new Date().getFullYear()} {brandName}
          </p>
        </div>
      </div>
    </div>
  )
}
