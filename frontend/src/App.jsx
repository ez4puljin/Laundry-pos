import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

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

export default function App() {
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

        {/* Protected — any authenticated user */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/"          element={<POSPage />}       />
                  <Route path="/queue"     element={<QueuePage />}     />
                  <Route path="/history"   element={<HistoryPage />}   />
                  <Route path="/warnings"  element={<WarningsPage />}  />
                  <Route path="/customers" element={<CustomersPage />} />

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
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  )
}
