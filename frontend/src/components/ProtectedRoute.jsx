import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

/** Role бүрийн үндсэн хуудас — үйлчлэгч зөвхөн Шүршүүр хуудсыг хардаг */
export const homeFor = (role) => (role === 'cleaner' ? '/rooms' : '/')

export default function ProtectedRoute({ children, requireAdmin = false, roles = null }) {
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

  return children
}
