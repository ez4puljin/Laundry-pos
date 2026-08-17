import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

/** Role бүрийн үндсэн хуудас — үйлчлэгч зөвхөн Шүршүүр хуудсыг хардаг */
export const homeFor = (role) => (role === 'cleaner' ? '/rooms' : '/')

/** Кассын ажлын хүрээ. Админ болон бусад role-д 'master' (бүгд харагдана). */
export const scopeOf = (user) =>
  user?.role === 'cashier' ? (user.cashier_scope || 'master') : 'master'

export const canLaundry = (user) => scopeOf(user) !== 'shower'
export const canShower  = (user) => scopeOf(user) !== 'laundry'

export default function ProtectedRoute({ children, requireAdmin = false, roles = null, scope = null }) {
  const user  = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  const home = homeFor(user.role)

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to={home} replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={home} replace />
  }

  // Кассын ажлын хүрээ — хамрахгүй хуудсанд орвол үндсэн хуудас руу буцаана
  if (scope === 'laundry' && !canLaundry(user)) return <Navigate to={home} replace />
  if (scope === 'shower'  && !canShower(user))  return <Navigate to={home} replace />

  return children
}
