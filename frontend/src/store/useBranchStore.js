import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import toast from 'react-hot-toast'
import { branchesApi } from '../api/client'

/* ── Сонгосон салбар ─────────────────────────────────────────
   Нэвтрэхээс ӨМНӨ сонгоно — бүх хүсэлт X-Branch толгойтой явна
   (client.js). Нэвтэрсний дараа салбар нь токенд шингэдэг тул
   энэ нь зөвхөн харагдац болон нэвтрэлтгүй хандалтад хэрэгтэй.
   ────────────────────────────────────────────────────────── */
const useBranchStore = create(
  persist(
    (set, get) => ({
      branch:   null,    // {id, code, name, address}
      branches: [],      // сонгох боломжтой салбарууд
      loading:  false,

      /** Нэвтрэлтгүй жагсаалт. Ганц салбартай бол шууд сонгоно. */
      fetchBranches: async () => {
        set({ loading: true })
        try {
          const { data } = await branchesApi.publicList()
          const list = data || []
          set({ branches: list })

          const cur = get().branch
          // Сонгосон салбар устсан/хаагдсан бол сонголтыг цуцална
          if (cur && !list.some(b => b.code === cur.code)) {
            set({ branch: null })
          }
          // Ганцхан салбартай бол сонгуулах шаардлагагүй
          if (list.length === 1) {
            set({ branch: list[0] })
          }
          return list
        } catch {
          return get().branches
        } finally {
          set({ loading: false })
        }
      },

      select: (branch) => set({ branch }),

      /** Нэвтэрсэн хэвээр өөр салбар руу шилжинэ (админ, нягтлан). */
      switchTo: async (code) => {
        try {
          const { data } = await branchesApi.switch(code)
          set({ branch: data.branch })
          toast.success(`${data.branch.name} салбар руу шилжлээ`)
          return data          // {access_token, user, branch}
        } catch {
          return null
        }
      },

      /** Гарахад салбарын СОНГОЛТ хэвээр үлдэнэ — дахин сонгуулахгүй. */
      clear: () => set({ branch: null }),
    }),
    { name: 'cemby-branch' },
  ),
)

export default useBranchStore
