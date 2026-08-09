import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:  null,
      token: null,

      setAuth: (user, token) => set({ user, token }),
      logout:  ()            => set({ user: null, token: null }),

      isAuthenticated: () => !!(get().token && get().user),
      isAdmin:         () => get().user?.role === 'admin',
    }),
    { name: 'cemby-auth' },
  ),
)

export default useAuthStore
