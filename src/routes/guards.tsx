import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Button'
import type { UserRole } from '@/types'

/** 未登录一律送回登录页；首次探测会话期间显示加载态，避免闪屏 */
export function ProtectedRoute() {
  const { session, initialized } = useAuth()
  const location = useLocation()

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/** 角色守卫：学生访问老师页面、老师访问学生页面时都会被弹回各自的首页 */
export function RequireRole({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { profile, initialized } = useAuth()

  if (!initialized || !profile) {
    return (
      <div className="flex h-64 items-center justify-center text-brand-600">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (profile.role !== role) {
    return <Navigate to={profile.role === 'teacher' ? '/board' : '/assignments'} replace />
  }

  return <>{children}</>
}

/** 登录后按其角色分流 */
export function RoleHome() {
  const { profile } = useAuth()
  if (!profile) return null
  return <Navigate to={profile.role === 'teacher' ? '/board' : '/assignments'} replace />
}
