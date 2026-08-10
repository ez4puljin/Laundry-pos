import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Users, LayoutDashboard,
  WashingMachine, Settings2, ClipboardList,
  UserCog, LogOut, Clock, AlertTriangle, ShowerHead,
} from 'lucide-react'
import toast from 'react-hot-toast'
import useStore     from '../store/useStore'
import useAuthStore from '../store/useAuthStore'
import { shiftsApi } from '../api/client'

const ALL_NAV = [
  { to: '/',          label: 'POS Кассчин',  short: 'Касс',      icon: ShoppingCart,    roles: ['admin', 'cashier'] },
  { to: '/queue',     label: 'Дараалал',     short: 'Дараалал',  icon: WashingMachine,  roles: ['admin', 'cashier'] },
  { to: '/rooms',     label: 'Шүршүүр',      short: 'Шүршүүр',   icon: ShowerHead,      roles: ['admin', 'cashier', 'cleaner'] },
  { to: '/history',   label: 'Түүх',         short: 'Түүх',      icon: ClipboardList,   roles: ['admin', 'cashier'] },
  { to: '/warnings',  label: 'Анхааруулга',  short: 'Анхаар',    icon: AlertTriangle,   roles: ['admin', 'cashier'] },
  { to: '/customers', label: 'Үйлчлүүлэгч', short: 'Харилцагч', icon: Users,           roles: ['admin', 'cashier'] },
  { to: '/inventory', label: 'Удирдлага',    short: 'Удирдлага', icon: Settings2,       roles: ['admin'] },
  { to: '/dashboard', label: 'Тайлан',       short: 'Тайлан',    icon: LayoutDashboard, roles: ['admin'] },
  { to: '/users',     label: 'Хэрэглэгч',   short: 'Хэрэглэгч', icon: UserCog,         roles: ['admin'] },
]

export default function Layout({ children }) {
  const itemCount = useStore(s => s.getItemCount())
  const user      = useAuthStore(s => s.user)
  const logout    = useAuthStore(s => s.logout)
  const navigate  = useNavigate()

  const [endingShift, setEndingShift] = useState(false)
  const [shiftSummary, setShiftSummary] = useState(null)

  const role     = user?.role || 'cashier'
  const isCashier = role === 'cashier'
  const navItems = ALL_NAV.filter(item => item.roles.includes(role))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleEndShift = async () => {
    if (!confirm('Ээлж дуусгах уу?')) return
    setEndingShift(true)
    try {
      const res = await shiftsApi.end()
      setShiftSummary(res.data)
    } catch {
      // error handled by interceptor
    } finally {
      setEndingShift(false)
    }
  }

  const printAndLogout = () => {
    window.print()
    setShiftSummary(null)
    handleLogout()
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

          {/* End Shift / Logout */}
          {isCashier ? (
            <button
              onClick={handleEndShift}
              disabled={endingShift}
              className="flex flex-col items-center justify-center w-16 h-12 rounded-xl
                         text-gray-400 hover:bg-orange-600/20 hover:text-orange-400 transition-all"
              title="Ээлж дуусгах"
            >
              <Clock className="w-5 h-5" />
              <span style={{ fontSize: '9px' }} className="mt-0.5">Дуусгах</span>
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="flex flex-col items-center justify-center w-16 h-12 rounded-xl
                         text-gray-400 hover:bg-red-600/20 hover:text-red-400 transition-all"
              title="Гарах"
            >
              <LogOut className="w-5 h-5" />
              <span style={{ fontSize: '9px' }} className="mt-0.5">Гарах</span>
            </button>
          )}
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
          <span className="text-white font-bold text-sm tracking-wide">Цэмбий Laundry</span>
          <div className="ml-auto flex items-center gap-2">
            {itemCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount} зүйл
              </span>
            )}
            {isCashier ? (
              <button
                onClick={handleEndShift}
                disabled={endingShift}
                className="p-1.5 text-gray-400 hover:text-orange-400 transition-colors"
                title="Ээлж дуусгах"
              >
                <Clock className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                title="Гарах"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
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

      {/* ── Shift Receipt Modal ────────────────────────── */}
      {shiftSummary && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Print-only receipt */}
            <div className="print:block hidden">
              <ShiftReceiptPrint data={shiftSummary} cashierName={user?.full_name} />
            </div>

            {/* Screen view */}
            <div className="print:hidden">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 text-white">
                <h3 className="font-bold">Тулгалтын баримт</h3>
                <p className="text-sm text-orange-100 mt-1">{user?.full_name}</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Эхэлсэн</span>
                  <span className="font-medium">{new Date(shiftSummary.shift.started_at).toLocaleString('mn-MN')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Дууссан</span>
                  <span className="font-medium">{new Date(shiftSummary.shift.ended_at).toLocaleString('mn-MN')}</span>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Нийт үйлчлүүлэгч</span>
                    <span className="font-bold">{shiftSummary.total_customers}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Нийт захиалга</span>
                    <span className="font-bold">{shiftSummary.total_orders}</span>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Бэлэн мөнгө</span>
                    <span className="font-bold">{shiftSummary.cash_total.toLocaleString()}₮</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Шилжүүлэг</span>
                    <span className="font-bold">{shiftSummary.transfer_total.toLocaleString()}₮</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Карт</span>
                    <span className="font-bold">{shiftSummary.card_total.toLocaleString()}₮</span>
                  </div>
                  {shiftSummary.late_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-500">💰 Нөхөж авсан төлбөр</span>
                      <span className="font-bold text-orange-600">
                        +{shiftSummary.late_total.toLocaleString()}₮
                      </span>
                    </div>
                  )}
                  {shiftSummary.unpaid_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-500">⚠️ Төлбөр төлөөгүй</span>
                      <span className="font-bold text-red-600">
                        {shiftSummary.unpaid_total.toLocaleString()}₮
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between text-base font-black">
                    <span>НИЙТ (төлөгдсөн)</span>
                    <span className="text-blue-600">{shiftSummary.total_revenue.toLocaleString()}₮</span>
                  </div>
                </div>
                <button onClick={printAndLogout}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl mt-2">
                  Хэвлэх & Гарах
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ── Shift Receipt for thermal printer (80mm) ── */
function ShiftReceiptPrint({ data, cashierName }) {
  const started = new Date(data.shift.started_at)
  const ended = new Date(data.shift.ended_at)
  const diffMs = ended - started
  const hours = Math.floor(diffMs / 3600000)
  const mins = Math.floor((diffMs % 3600000) / 60000)

  const fmt = (d) => d.toLocaleString('mn-MN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })

  return (
    <div style={{ width: '80mm', fontFamily: 'monospace', fontSize: '12px', padding: '4mm' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>ЦЭМБИЙ УГААЛГА</div>
        <div style={{ fontWeight: 'bold', fontSize: '13px', marginTop: '4px' }}>ТУЛГАЛТЫН БАРИМТ</div>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div>Касс: {cashierName}</div>
      <div>Эхэлсэн: {fmt(started)}</div>
      <div>Дууссан: {fmt(ended)}</div>
      <div>Хугацаа: {hours}ц {mins}мин</div>
      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Нийт үйлчлүүлэгч:</span><span>{data.total_customers}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Нийт захиалга:</span><span>{data.total_orders}</span>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ fontWeight: 'bold' }}>ТӨЛБӨРИЙН ЗАДАРГАА:</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>  Бэлэн мөнгө:</span><span>{data.cash_total.toLocaleString()}₮</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>  Шилжүүлэг:</span><span>{data.transfer_total.toLocaleString()}₮</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>  Карт:</span><span>{data.card_total.toLocaleString()}₮</span>
      </div>
      {data.late_total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>  Нөхөж авсан:</span><span>+{data.late_total.toLocaleString()}₮</span>
        </div>
      )}
      {data.unpaid_total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>  Төлбөр төлөөгүй:</span><span>{data.unpaid_total.toLocaleString()}₮</span>
        </div>
      )}
      <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
        <span>НИЙТ (төлөгдсөн):</span><span>{data.total_revenue.toLocaleString()}₮</span>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
      <div style={{ marginTop: '16px' }}>Хүлээн авсан: _______________</div>
      <div style={{ marginTop: '16px' }}>Хүлээлгэн өгсөн: ___________</div>
      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
    </div>
  )
}
