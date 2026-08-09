import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// ── Request: attach Bearer token ────────────────────────
api.interceptors.request.use((config) => {
  try {
    const stored = JSON.parse(localStorage.getItem('cemby-auth') || '{}')
    const token  = stored?.state?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (_) {}
  return config
})

// ── Response: handle errors ─────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear auth state and redirect to login
      localStorage.removeItem('cemby-auth')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(err)
    }
    // ── Сервер унтарсан / дахин ачаалж байна ──────────────
    // Ийм үед хуудсан дээрх бүх хүсэлт зэрэг унадаг тул ижил id-гаар
    // ганцхан мэдэгдэл харуулна (6 ширхэг "Алдаа гарлаа" давхарлахгүй).
    if (!err.response) {
      toast.error(
        err.code === 'ECONNABORTED'
          ? 'Сервер удаан хариулж байна. Дахин оролдоно уу.'
          : 'Сервертэй холбогдож чадсангүй. Сервер ачаалж дуусахыг хүлээнэ үү.',
        { id: 'net-error' },
      )
      return Promise.reject(err)
    }

    // FastAPI-ийн 422 алдаа detail-ыг жагсаалтаар буцаадаг — текст болгоно
    const detail = err.response?.data?.detail
    const msg = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map(d => d?.msg || JSON.stringify(d)).join(', ')
        : 'Алдаа гарлаа'
    toast.error(msg)
    return Promise.reject(err)
  },
)

// ── Services ────────────────────────────────────────────
export const servicesApi = {
  list:   (params = {}) => api.get('/services/', { params }),
  search: (q)           => api.get('/services/search', { params: { q } }),
  create: (data)        => api.post('/services/', data),
  update: (id, data)    => api.put(`/services/${id}`, data),
  remove: (id)          => api.delete(`/services/${id}`),
}

// ── Customers ───────────────────────────────────────────
export const customersApi = {
  list:      (params = {}) => api.get('/customers/', { params }),
  search:    (phone)       => api.get('/customers/search', { params: { phone } }),
  get:       (id)          => api.get(`/customers/${id}`),
  create:    (data)        => api.post('/customers/', data),
  update:    (id, data)    => api.put(`/customers/${id}`, data),
  remove:    (id)          => api.delete(`/customers/${id}`),
  orders:    (id)          => api.get(`/customers/${id}/orders`),
  addPoints: (id, points)  => api.post(`/customers/${id}/add-points`, null, { params: { points } }),
}

// ── Orders ──────────────────────────────────────────────
export const ordersApi = {
  list:           (params = {}) => api.get('/orders/', { params }),
  queue:          ()            => api.get('/orders/queue'),
  get:            (id)          => api.get(`/orders/${id}`),
  create:         (data)        => api.post('/orders/', data),
  addItem:        (id, data)    => api.post(`/orders/${id}/items`, data),
  remove:         (id)          => api.delete(`/orders/${id}`),
  pay:            (id, data)    => api.patch(`/orders/${id}/pay`, data),
  updateNotes:    (id, notes)   => api.patch(`/orders/${id}/notes`, { notes }),
  updateStatus:   (id, status)  => api.patch(`/orders/${id}/status`, { status }),
  flagged:        (params = {}) => api.get('/orders/flagged', { params }),
  latePayments:   (params = {}) => api.get('/orders/late-payments', { params }),
  flag:           (id, reason)  => api.post(`/orders/${id}/flag`, { reason }),
  unflag:         (id)          => api.delete(`/orders/${id}/flag`),
  validateCoupon: (data)        => api.post('/orders/coupons/validate', data),
  archiveDelivered: ()          => api.post('/orders/archive-delivered'),
  listCoupons:    ()            => api.get('/orders/coupons/'),
  createCoupon:   (data)        => api.post('/orders/coupons/', data),
  updateCoupon:   (id, data)    => api.put(`/orders/coupons/${id}`, data),
  toggleCoupon:   (id)          => api.patch(`/orders/coupons/${id}/toggle`),
  deleteCoupon:   (id)          => api.delete(`/orders/coupons/${id}`),
}

// ── Inventory ───────────────────────────────────────────
export const inventoryApi = {
  list:   (params = {}) => api.get('/inventory/', { params }),
  create: (data)        => api.post('/inventory/', data),
  update: (id, data)    => api.patch(`/inventory/${id}`, data),
  remove: (id)          => api.delete(`/inventory/${id}`),
  adjust: (id, data)    => api.post(`/inventory/${id}/adjust`, data),
}

// ── Categories ──────────────────────────────────────────
export const categoriesApi = {
  list:   ()         => api.get('/categories/'),
  create: (data)     => api.post('/categories/', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  remove: (id)       => api.delete(`/categories/${id}`),
}

// ── Reports ─────────────────────────────────────────────
export const reportsApi = {
  dashboard:   ()           => api.get('/reports/dashboard'),
  daily:       (start, end) => api.get('/reports/daily', { params: { start, end } }),
  topServices: (start, end) => api.get('/reports/top-services', { params: { start, end } }),
  cashierDays: (start, end) => api.get('/reports/cashier-days', { params: { start, end } }),
  inventory:   ()           => api.get('/reports/inventory-status'),
}

// ── Users ───────────────────────────────────────────────
export const usersApi = {
  list:          ()           => api.get('/users/'),
  create:        (data)       => api.post('/users/', data),
  update:        (id, data)   => api.put(`/users/${id}`, data),
  resetPassword: (id, pw)     => api.post(`/users/${id}/reset-password`, { new_password: pw }),
  remove:        (id)         => api.delete(`/users/${id}`),
}

// ── Machines ──────────────────────────────────────────────
export const machinesApi = {
  list:          (params = {}) => api.get('/machines/', { params }),
  create:        (data)     => api.post('/machines/', data),
  update:        (id, data) => api.put(`/machines/${id}`, data),
  remove:        (id)       => api.delete(`/machines/${id}`),
  assign:        (id, data) => api.post(`/machines/${id}/assign`, data),
  complete:      (id)       => api.post(`/machines/${id}/complete`),
  activeUsages:  ()         => api.get('/machines/active-usages'),
  dailySummary:  (date)     => api.get('/machines/daily-summary', { params: { date } }),
  report:        (start, end) => api.get('/machines/report', { params: { start, end } }),
  usagesByOrder: (orderId)    => api.get(`/machines/usages-by-order/${orderId}`),
}

// ── Settings ──────────────────────────────────────────────
export const settingsApi = {
  getSms:       ()     => api.get('/settings/sms'),
  updateSms:    (data) => api.put('/settings/sms', data),
  getPoints:    ()     => api.get('/settings/points'),
  updatePoints: (data) => api.put('/settings/points', data),
  getReceipt:    ()     => api.get('/settings/receipt'),
  updateReceipt: (data) => api.put('/settings/receipt', data),
}

// ── Shifts ────────────────────────────────────────────────
export const shiftsApi = {
  active:   ()           => api.get('/shifts/active'),
  start:    ()           => api.post('/shifts/start'),
  end:      ()           => api.post('/shifts/end'),
  history:  (params = {}) => api.get('/shifts/history', { params }),
  summary:  (id)         => api.get(`/shifts/${id}/summary`),
}

// ── Admin ─────────────────────────────────────────────────
export const adminApi = {
  cleanup: () => api.post('/admin/cleanup'),
}

export default api
