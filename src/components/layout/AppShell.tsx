import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

export function AppShell() {
  const { profile, isTeacher, signOut } = useAuth()
  const navigate = useNavigate()

  const teacherNav = [
    { to: '/board', label: '任务看板' },
    { to: '/students', label: '我的学生' },
    { to: '/invites', label: '邀请码' },
  ]
  const studentNav = [{ to: '/assignments', label: '我的作业' }]

  const nav = isTeacher ? teacherNav : studentNav

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <button onClick={() => navigate('/')} className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              P
            </span>
            <span className="hidden text-sm font-semibold text-slate-900 sm:inline">发音纠音平台</span>
          </button>

          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{profile?.full_name}</p>
              <p className="text-xs text-slate-500">{isTeacher ? '老师' : '学生'}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut()
                navigate('/login', { replace: true })
              }}
            >
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        发音纠音平台 · 老师布置 → 学生朗读 → 批注讲解 → 修改复练
      </footer>
    </div>
  )
}
