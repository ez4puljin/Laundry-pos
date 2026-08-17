import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import useBrandStore from './store/useBrandStore'

import Layout         from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

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

export default function App() {
  const fetchBrand = useBrandStore(s => s.fetchBrand)
  const brandName  = useBrandStore(s => s.brand_name)

  useEffect(() => { fetchBrand() }, [fetchBrand])
  useEffect(() => { document.title = brandName }, [brandName])

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { borderRadius: '12px', fontFamily: 'inherit', fontSize: '14px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
        }}
      />
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
              <Layout>
                <Routes>
                  {/* Кассчин + Админ */}
                  <Route path="/"          element={<ProtectedRoute roles={STAFF}><POSPage /></ProtectedRoute>}       />
                  <Route path="/queue"     element={<ProtectedRoute roles={STAFF} scope="laundry"><QueuePage /></ProtectedRoute>} />
                  <Route path="/history"   element={<ProtectedRoute roles={STAFF}><HistoryPage /></ProtectedRoute>}   />
                  <Route path="/warnings"  element={<ProtectedRoute roles={STAFF}><WarningsPage /></ProtectedRoute>}  />
                  <Route path="/customers" element={<ProtectedRoute roles={STAFF}><CustomersPage /></ProtectedRoute>} />

                  {/* Бүх role — үйлчлэгч ч хамрагдана; laundry кассчинд хаалттай */}
                  <Route path="/rooms"     element={<ProtectedRoute scope="shower"><RoomsPage /></ProtectedRoute>} />

                  {/* Admin only */}
                  <Route path="/inventory" element={
                    <ProtectedRoute requireAdmin><ManagePage /></ProtectedRoute>
                  } />
                  <Route path="/dashboard" element={
                    <ProtectedRoute requireAdmin><DashboardPage /></ProtectedRoute>
                  } />
                  <Route path="/users" element={
                    <ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>
                  } />
                  <Route path="/finance" element={
                    <ProtectedRoute requireAdmin><FinancePage /></ProtectedRoute>
                  } />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  )
}
