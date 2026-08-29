import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// ── Request: Bearer токен + сонгосон салбар ─────────────
// Токен дотор ч салбар байдаг (сервер түүнийг эрхэмлэнэ). X-Branch нь
// НЭВТРЭЭГҮЙ хандалтад (нэвтрэх хуудас, ТВ дэлгэц) хэрэгтэй.
api.interceptors.request.use((config) => {
  try {
    const stored = JSON.parse(localStorage.getItem('cemby-auth') || '{}')
    const token  = stored?.state?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (_) {}
  try {
    const br = JSON.parse(localStorage.getItem('cemby-branch') || '{}')
    const code = br?.state?.branch?.code
    if (code) {
      config.headers['X-Branch'] = code
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

    // ── Лицензийн хугацаа дууссан / түгжигдсэн ────────────
    // Backend бүх ажлын цэгийг хаасан тул хуудсыг дахин ачаалж
    // LicenseGate дэлгэцийг гаргана (toast харуулах нь утгагүй).
    if (err.response?.status === 402) {
      window.location.reload()
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
  summary:        (params = {}) => api.get('/orders/summary', { params }),
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
  dashboard:   (kind)             => api.get('/reports/dashboard', { params: kind ? { kind } : {} }),
  daily:       (start, end, kind) => api.get('/reports/daily', { params: { start, end, ...(kind ? { kind } : {}) } }),
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

// ── Барааны ангилал (үйлчилгээнийхээс тусдаа) ────────
export const productCategoriesApi = {
  list:   (params = {}) => api.get('/product-categories/', { params }),
  create: (data)     => api.post('/product-categories/', data),
  update: (id, data) => api.put(`/product-categories/${id}`, data),
  remove: (id)       => api.delete(`/product-categories/${id}`),
}

// ── Шүршүүр: Тариф ба өрөөний төрөл ────────
export const showerTariffsApi = {
  list:   (params = {}) => api.get('/shower-tariffs/', { params }),
  create: (data)     => api.post('/shower-tariffs/', data),
  update: (id, data) => api.put(`/shower-tariffs/${id}`, data),
  remove: (id)       => api.delete(`/shower-tariffs/${id}`),
}

export const roomTypesApi = {
  list:   (params = {}) => api.get('/room-types/', { params }),
  create: (data)     => api.post('/room-types/', data),
  update: (id, data) => api.put(`/room-types/${id}`, data),
  remove: (id)       => api.delete(`/room-types/${id}`),
}

// ── Шүршүүр: Өрөө ба дараалал ─────────────────────────────
export const roomsApi = {
  list:          (params = {}) => api.get('/rooms/', { params }),
  create:        (data)     => api.post('/rooms/', data),
  update:        (id, data) => api.put(`/rooms/${id}`, data),
  remove:        (id)       => api.delete(`/rooms/${id}`),
  saveLayout:    (items)    => api.put('/rooms/layout', { items }),
  start:         (id)       => api.post(`/rooms/${id}/start`),
  finish:        (id)       => api.post(`/rooms/${id}/finish`),
  cleaningStart: (id)       => api.post(`/rooms/${id}/cleaning-start`),
  cleaningDone:  (id)       => api.post(`/rooms/${id}/cleaning-done`),
  waiting:       ()         => api.get('/room-sessions/waiting'),
  // Нэг буюу хэд хэдэн тасалбарыг НЭГ өрөөнд оруулна (гэр бүл хамт)
  assign:        (sessionIds, roomId) => api.post('/room-sessions/assign', {
                   session_ids: Array.isArray(sessionIds) ? sessionIds : [sessionIds],
                   room_id: roomId,
                 }),
  cancelTicket:  (sid)      => api.post(`/room-sessions/${sid}/cancel`),
  noShow:        (sid)      => api.post(`/room-sessions/${sid}/no-show`),
  arrived:       (sid)      => api.post(`/room-sessions/${sid}/arrived`),
}

// ── Санхүү (зөвхөн админ) ─────────────────────────────────
export const financeApi = {
  accounts:       (params = {}) => api.get('/finance/accounts', { params }),
  createAccount:  (d)     => api.post('/finance/accounts', d),
  updateAccount:  (id, d) => api.put(`/finance/accounts/${id}`, d),
  removeAccount:  (id)    => api.delete(`/finance/accounts/${id}`),
  suppliers:      (params = {}) => api.get('/finance/suppliers', { params }),
  createSupplier: (d)     => api.post('/finance/suppliers', d),
  updateSupplier: (id, d) => api.put(`/finance/suppliers/${id}`, d),
  removeSupplier: (id)    => api.delete(`/finance/suppliers/${id}`),
  purchases:      (params = {}) => api.get('/finance/purchases', { params }),
  createPurchase: (d)     => api.post('/finance/purchases', d),
  removePurchase: (id)    => api.delete(`/finance/purchases/${id}`),
  debts:          (params = {}) => api.get('/finance/debts', { params }),
  createDebt:     (d)     => api.post('/finance/debts', d),
  payDebt:        (id, d) => api.post(`/finance/debts/${id}/pay`, d),
  removeDebt:     (id)    => api.delete(`/finance/debts/${id}`),
  transactions:   (params = {}) => api.get('/finance/transactions', { params }),
  createTx:       (d)     => api.post('/finance/transactions', d),
  removeTx:       (id)    => api.delete(`/finance/transactions/${id}`),
  summary:        (params = {}) => api.get('/finance/summary', { params }),
}

// ── Settings ──────────────────────────────────────────────
export const settingsApi = {
  getBrand:     ()     => api.get('/public/brand'),
  updateBrand:  (data) => api.put('/settings/brand', data),
  getSms:       ()     => api.get('/settings/sms'),
  updateSms:    (data) => api.put('/settings/sms', data),
  getPoints:    ()     => api.get('/settings/points'),
  updatePoints: (data) => api.put('/settings/points', data),
  getReceipt:    ()     => api.get('/settings/receipt'),
  updateReceipt: (data) => api.put('/settings/receipt', data),
}

// ── Нөөшлөлт (зөвхөн админ) ───────────────────────────────
export const backupApi = {
  list:   ()      => api.get('/backup/'),
  config: (data)  => api.put('/backup/config', data),
  create: (note)  => {
    const fd = new FormData()
    fd.append('note', note || '')
    // Нөөц үүсгэхэд хэдэн арван секунд болж болно
    return api.post('/backup/create', fd, { timeout: 300000 })
  },
  remove: (name)  => api.delete(`/backup/${encodeURIComponent(name)}`),
  // Татах нь хөтчөөр шууд — токеныг query-гээр дамжуулахгүй тул blob авна
  download: (name) => api.get(`/backup/download/${encodeURIComponent(name)}`,
                              { responseType: 'blob', timeout: 300000 }),
  restore: ({ name, file, confirm }) => {
    const fd = new FormData()
    fd.append('confirm', confirm)
    if (name) fd.append('name', name)
    if (file) fd.append('file', file)
    return api.post('/backup/restore', fd, { timeout: 600000 })
  },
}

// ── Салбар ────────────────────────────────────────────────
export const branchesApi = {
  // Нэвтрэлтгүй — салбар сонгох дэлгэц
  publicList: ()          => api.get('/public/branches'),
  list:       ()          => api.get('/branches/'),
  create:     (data)      => api.post('/branches/', data),
  update:     (id, data)  => api.put(`/branches/${id}`, data),
  remove:     (id)        => api.delete(`/branches/${id}`),
  mine:       ()          => api.get('/auth/my-branches'),
  switch:     (code)      => api.post('/auth/switch-branch', { branch_code: code }),
}

// Бүх салбарт хүчинтэй хэрэглэгч (админ, нягтлан)
export const globalUsersApi = {
  list:   ()         => api.get('/global-users/'),
  create: (data)     => api.post('/global-users/', data),
  update: (id, data) => api.put(`/global-users/${id}`, data),
  remove: (id)       => api.delete(`/global-users/${id}`),
}

// ── Shifts ────────────────────────────────────────────────
export const shiftsApi = {
  active:   ()           => api.get('/shifts/active'),
  my:       ()           => api.get('/shifts/my'),
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
