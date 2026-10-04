import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Alert, TextField } from '@/components/ui/Field'
import { getAuthRedirectError } from '@/utils/authRedirectError'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // 邮件确认链接失效时（#error=...）在应用启动阶段暂存的提示
  const [error, setError] = useState<string | null>(() => getAuthRedirectError())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const profile = await signIn(email.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? (profile.role === 'teacher' ? '/board' : '/assignments'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="登录" subtitle="老师与学生共用同一个入口，登录后自动进入各自的工作台">
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="邮箱"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="密码"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          登录
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        学生还没有账号？
        <Link to="/register" className="ml-1 font-medium text-brand-600 hover:text-brand-700">
          用邀请码注册
        </Link>
      </p>
    </AuthLayout>
  )
}

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            P
          </span>
          <h1 className="text-2xl font-bold text-slate-900">发音纠音平台</h1>
          <p className="mt-1 text-sm text-slate-500">朗读 → 批注 → 讲解 → 再练，一次闭环</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

export { AuthLayout }
