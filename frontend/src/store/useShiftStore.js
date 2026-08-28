import { create } from 'zustand'
import toast from 'react-hot-toast'
import { shiftsApi } from '../api/client'

/* ── Кассын ээлжийн төлөв ───────────────────────────────────
   POS нээгдэх эсэхийг энэ store шийднэ. ShiftGate дэлгэцийг
   хааж/нээж, Layout нь «Дуусгах» товчийг эндээс дуудна.

   state (GET /shifts/my):
     requires_shift — кассчин мөн үү (админ/үйлчлэгчид false)
     scope, scope_label — кассын төрөл
     shift      — өөрийн идэвхтэй ээлж (null бол эхлээгүй)
     blocked_by — саад болж буй ӨӨР кассын идэвхтэй ээлж
   ─────────────────────────────────────────────────────────── */
const useShiftStore = create((set, get) => ({
  state:   null,     // ShiftState
  loading: true,     // анхны ачаалалт
  busy:    false,    // эхлүүлэх / дуусгах явж байна
  summary: null,     // ээлж хаасны дараах тулгалтын баримт

  /** Серверээс төлвийг татна. silent=true үед spinner харуулахгүй (poll). */
  refresh: async (silent = false) => {
    if (!silent) set({ loading: true })
    try {
      const res = await shiftsApi.my()
      set({ state: res.data, loading: false })
      return res.data
    } catch {
      // Сүлжээ/эрхийн алдаа — хуучин төлвийг хэвээр үлдээж, дэлгэцийг түгжихгүй
      set({ loading: false })
      return get().state
    }
  },

  startShift: async () => {
    set({ busy: true })
    try {
      await shiftsApi.start()
      await get().refresh(true)
      toast.success('Ээлж эхэллээ')
      return true
    } catch {
      await get().refresh(true)   // саад болсон ээлжийг шинэчилж харуулна
      return false
    } finally {
      set({ busy: false })
    }
  },

  /** Ээлж хаах — амжилттай бол тулгалтын баримтыг буцаана. */
  endShift: async () => {
    set({ busy: true })
    try {
      const res = await shiftsApi.end()
      set({ summary: res.data })
      await get().refresh(true)
      return res.data
    } catch {
      return null                 // алдааг interceptor toast-оор харуулна
    } finally {
      set({ busy: false })
    }
  },

  clearSummary: () => set({ summary: null }),
  reset:        () => set({ state: null, loading: true, busy: false, summary: null }),
}))

export default useShiftStore
