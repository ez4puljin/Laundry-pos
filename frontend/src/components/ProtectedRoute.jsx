import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const user  = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
