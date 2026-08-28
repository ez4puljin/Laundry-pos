import { NavLink, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Users, LayoutDashboard,
  WashingMachine, Settings2, ClipboardList,
  UserCog, LogOut, Clock, AlertTriangle, ShowerHead, Wallet,
} from 'lucide-react'
import useStore     from '../store/useStore'
import useAuthStore from '../store/useAuthStore'
import useBrandStore from '../store/useBrandStore'
import useShiftStore from '../store/useShiftStore'
import { canLaundry, canShower } from './ProtectedRoute'

// scope: кассчинд л үйлчилнэ — 'laundry' зөвхөн угаалгын, 'shower' зөвхөн шүршүүрийн
// хэсгүүдийг харна. Мастер кассчин болон админ бүгдийг харна.
const ALL_NAV = [
  { to: '/',          label: 'POS Кассчин',  short: 'Касс',      icon: ShoppingCart,    roles: ['admin', 'cashier'] },
  { to: '/queue',     label: 'Дараалал',     short: 'Дараалал',  icon: WashingMachine,  roles: ['admin', 'cashier'], scope: 'laundry' },
  { to: '/rooms',     label: 'Шүршүүр',      short: 'Шүршүүр',   icon: ShowerHead,      roles: ['admin', 'cashier', 'cleaner'], scope: 'shower' },
  { to: '/history',   label: 'Түүх',         short: 'Түүх',      icon: ClipboardList,   roles: ['admin', 'cashier'] },
  { to: '/warnings',  label: 'Анхааруулга',  short: 'Анхаар',    icon: AlertTriangle,   roles: ['admin', 'cashier'] },
  { to: '/customers', label: 'Үйлчлүүлэгч', short: 'Харилцагч', icon: Users,           roles: ['admin', 'cashier'] },
  { to: '/inventory', label: 'Удирдлага',    short: 'Удирдлага', icon: Settings2,       roles: ['admin'] },
  { to: '/finance',   label: 'Санхүү',       short: 'Санхүү',    icon: Wallet,          roles: ['admin'] },
  { to: '/dashboard', label: 'Тайлан',       short: 'Тайлан',    icon: LayoutDashboard, roles: ['admin'] },
  { to: '/users',     label: 'Хэрэглэгч',   short: 'Хэрэглэгч', icon: UserCog,         roles: ['admin'] },
]

export default function Layout({ children }) {
  const itemCount  = useStore(s => s.getItemCount())
  const user       = useAuthStore(s => s.user)
  const logout     = useAuthStore(s => s.logout)
  const brandShort = useBrandStore(s => s.brand_short)
  const navigate   = useNavigate()

  const endShift    = useShiftStore(s => s.endShift)
  const endingShift = useShiftStore(s => s.busy)

  const role     = user?.role || 'cashier'
  const isCashier = role === 'cashier'
  const navItems = ALL_NAV.filter(item => {
    if (!item.roles.includes(role)) return false
    if (item.scope === 'laundry' && !canLaundry(user)) return false
    if (item.scope === 'shower'  && !canShower(user))  return false
    return true
  })

  // Ээлж хаалгүйгээр гарч болно — дараа нь буцаж нэвтрэхэд ээлж хэвээр нээлттэй
  const handleLogout = () => {
    useShiftStore.getState().reset()
    logout()
    navigate('/login', { replace: true })
  }

  // Тулгалтын баримтыг ShiftGate харуулна (ээлж хаагдсаны дараа ч үлдэнэ)
  const handleEndShift = async () => {
    if (!confirm('Ээлж дуусгах уу?')) return
    await endShift()
  }

  const initials = (user?.full_name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex h-screen bg-gray-100">

      {/* ── Desktop sidebar ────────────────────────────── */}
      <aside className="hidden md:flex w-20 bg-gray-900 flex-col items-center py-4 gap-1 shadow-xl shrink-0">

        {/* Logo */}
        <div className="mb-3">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
            <WashingMachine className="text-white w-7 h-7" />
          </div>
        </div>

        {/* Nav items */}
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center w-16 h-16 rounded-xl
               text-xs font-medium transition-all
               ${isActive
                 ? 'bg-blue-600 text-white shadow-lg'
                 : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-center leading-tight" style={{ fontSize: '9px' }}>{label}</span>
                {to === '/' && itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white
                                   text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {itemCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Spacer + user info + logout */}
        <div className="mt-auto flex flex-col items-center gap-2 pb-1">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-1 w-16">
            <div className="w-9 h-9 bg-blue-700 rounded-full flex items-center justify-center shadow">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            <span className="text-gray-500 leading-tight text-center w-14 truncate"
                  style={{ fontSize: '9px' }}>
              {user?.full_name}
            </span>
            {role === 'admin' && (
              <span className="bg-yellow-500/20 text-yellow-400 rounded px-1"
                    style={{ fontSize: '8px' }}>
                admin
              </span>
            )}
          </div>

          {/* Ээлж дуусгах — зөвхөн кассчинд */}
          {isCashier && (
            <button
              onClick={handleEndShift}
              disabled={endingShift}
              className="flex flex-col items-center justify-center w-16 h-12 rounded-xl
                         text-gray-400 hover:bg-orange-600/20 hover:text-orange-400
                         disabled:opacity-50 transition-all"
              title="Ээлж дуусгаж тулгалтын баримт хэвлэх"
            >
              <Clock className="w-5 h-5" />
              <span style={{ fontSize: '9px' }} className="mt-0.5">Дуусгах</span>
            </button>
          )}

          {/* Гарах — ээлж НЭЭЛТТЭЙ хэвээр үлдэнэ */}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center w-16 h-12 rounded-xl
                       text-gray-400 hover:bg-red-600/20 hover:text-red-400 transition-all"
            title={isCashier ? 'Ээлж хаахгүйгээр бүртгэлээс гарах' : 'Гарах'}
          >
            <LogOut className="w-5 h-5" />
            <span style={{ fontSize: '9px' }} className="mt-0.5">Гарах</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main
        className="flex-1 overflow-hidden flex flex-col min-w-0 md:pb-0"
        style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 bg-gray-900 shrink-0"
             style={{ height: '52px' }}>
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
            <WashingMachine className="text-white w-4 h-4" />
          </div>
          <span className="text-white font-bold text-sm tracking-wide truncate">{brandShort}</span>
          <div className="ml-auto flex items-center gap-2">
            {itemCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount} зүйл
              </span>
            )}
            {isCashier && (
              <button
                onClick={handleEndShift}
                disabled={endingShift}
                className="p-1.5 text-gray-400 hover:text-orange-400
                           disabled:opacity-50 transition-colors"
                title="Ээлж дуусгах"
              >
                <Clock className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
              title={isCashier ? 'Ээлж хаахгүйгээр гарах' : 'Гарах'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200
                   flex items-stretch z-50 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {navItems.map(({ to, short, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 gap-0.5 pt-2 pb-1
               transition-colors active:scale-95
               ${isActive ? 'text-blue-600' : 'text-gray-400'}`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`relative flex items-center justify-center w-9 h-7 rounded-xl transition-all
                                  ${isActive ? 'bg-blue-50' : ''}`}>
                  <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  {to === '/' && itemCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white
                                     leading-none w-4 h-4 rounded-full flex items-center justify-center
                                     font-bold" style={{ fontSize: '9px' }}>
                      {itemCount > 9 ? '9+' : itemCount}
                    </span>
                  )}
                </div>
                <span className={`font-medium leading-none transition-colors
                                   ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
                      style={{ fontSize: '10px' }}>
                  {short}
                </span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5
                                   bg-blue-600 rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
