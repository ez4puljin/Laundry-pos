import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import useBrandStore from './store/useBrandStore'
import useBranchStore from './store/useBranchStore'

import Layout         from './components/Layout'
import LicenseGate    from './components/LicenseGate'
import ProtectedRoute from './components/ProtectedRoute'
import ShiftGate      from './components/ShiftGate'
import BranchGate     from './components/BranchGate'

import LoginPage     from './pages/LoginPage'
import POSPage       from './pages/POSPage'
import QueuePage     from './pages/QueuePage'
import CustomersPage from './pages/CustomersPage'
import ManagePage    from './pages/ManagePage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage   from './pages/HistoryPage'
import UsersPage     from './pages/UsersPage'
import WarningsPage  from './pages/WarningsPage'
import RoomsPage        from './pages/RoomsPage'
import QueueDisplayPage from './pages/QueueDisplayPage'
import FinancePage      from './pages/FinancePage'

const STAFF = ['admin', 'cashier']
// Нягтлан — POS-оос бусдыг харна, Санхүү/Бараа/Үйлчилгээг засна
const BOOKS = ['admin', 'accountant']
const STAFF_BOOKS = ['admin', 'cashier', 'accountant']

export default function App() {
  const fetchBrand = useBrandStore(s => s.fetchBrand)
  const brandName  = useBrandStore(s => s.brand_name)
  // Тохиргоо салбар тус бүрд тусдаа тул салбар солигдох бүрд дахин татна
  const branchCode = useBranchStore(s => s.branch?.code)

  useEffect(() => { fetchBrand(branchCode) }, [fetchBrand, branchCode])
  useEffect(() => { document.title = brandName }, [brandName])

  return (
    <LicenseGate>
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { borderRadius: '12px', fontFamily: 'inherit', fontSize: '14px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
        }}
      />
      <BranchGate>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        {/* Хүлээлгийн танхимын ТВ дэлгэц — нэвтрэлтгүй */}
        <Route path="/tv" element={<QueueDisplayPage />} />

        {/* Protected — any authenticated user */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <ShiftGate>
              <Layout>
                <Routes>
                  {/* Кассчин + Админ */}
                  <Route path="/"          element={<ProtectedRoute roles={STAFF}><POSPage /></ProtectedRoute>}       />
                  <Route path="/queue"     element={<ProtectedRoute roles={STAFF} scope="laundry"><QueuePage /></ProtectedRoute>} />
                  <Route path="/history"   element={<ProtectedRoute roles={STAFF_BOOKS}><HistoryPage /></ProtectedRoute>}   />
                  <Route path="/warnings"  element={<ProtectedRoute roles={STAFF_BOOKS}><WarningsPage /></ProtectedRoute>}  />
                  <Route path="/customers" element={<ProtectedRoute roles={STAFF_BOOKS}><CustomersPage /></ProtectedRoute>} />

                  {/* Бүх role — үйлчлэгч ч хамрагдана; laundry кассчинд хаалттай */}
                  <Route path="/rooms"     element={<ProtectedRoute scope="shower"><RoomsPage /></ProtectedRoute>} />

                  {/* Admin only */}
                  <Route path="/inventory" element={
                    <ProtectedRoute roles={BOOKS}><ManagePage /></ProtectedRoute>
                  } />
                  <Route path="/dashboard" element={
                    <ProtectedRoute roles={BOOKS}><DashboardPage /></ProtectedRoute>
                  } />
                  <Route path="/users" element={
                    <ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>
                  } />
                  <Route path="/finance" element={
                    <ProtectedRoute roles={BOOKS}><FinancePage /></ProtectedRoute>
                  } />
                </Routes>
              </Layout>
              </ShiftGate>
            </ProtectedRoute>
          }
        />

      </Routes>
      </BranchGate>
    </BrowserRouter>
    </LicenseGate>
  )
}
