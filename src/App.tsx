import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { InstallHint } from '@/components/pwa/InstallHint'
import { ProtectedRoute, RequireRole, RoleHome } from '@/routes/guards'
import { useAuth } from '@/hooks/useAuth'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import TeacherDashboard from '@/pages/TeacherDashboard'
import StudentDashboard from '@/pages/StudentDashboard'
import AssignmentDetailPage from '@/pages/AssignmentDetailPage'
import InviteCodesPage from '@/pages/InviteCodesPage'
import StudentsPage from '@/pages/StudentsPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  const { session, initialized } = useAuth()

  return (
    <>
      <Routes>
        {/* 公开路由：已登录用户访问会直接跳回首页 */}
        <Route
          path="/login"
          element={initialized && session ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={initialized && session ? <Navigate to="/" replace /> : <RegisterPage />}
        />

        {/* 需要登录 */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<RoleHome />} />

            {/* 老师专属 */}
            <Route
              path="/board"
              element={
                <RequireRole role="teacher">
                  <TeacherDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/students"
              element={
                <RequireRole role="teacher">
                  <StudentsPage />
                </RequireRole>
              }
            />
            <Route
              path="/invites"
              element={
                <RequireRole role="teacher">
                  <InviteCodesPage />
                </RequireRole>
              }
            />

            {/* 学生专属 */}
            <Route
              path="/assignments"
              element={
                <RequireRole role="student">
                  <StudentDashboard />
                </RequireRole>
              }
            />

            {/* 双方共用：老师进入即批改，学生进入即查看反馈/重新提交 */}
            <Route path="/assignments/:id" element={<AssignmentDetailPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {/* 全站生效：引导把应用装到主屏，或从微信内置浏览器换到系统浏览器 */}
      <InstallHint />
    </>
  )
}
