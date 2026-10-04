import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Alert, TextField } from '@/components/ui/Field'
import { AuthLayout } from '@/pages/LoginPage'

export default function RegisterPage() {
  const { signUpWithInvite } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [inviteCode, setInviteCode] = useState((params.get('code') ?? '').toUpperCase())
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { needsEmailConfirm } = await signUpWithInvite({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        inviteCode: inviteCode.trim().toUpperCase(),
      })
      if (needsEmailConfirm) setDone(true)
      else navigate('/assignments', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="注册成功" subtitle="还差最后一步">
        <Alert tone="success">
          我们已向 <strong>{email}</strong> 发送了一封验证邮件，请点击邮件中的链接完成激活，然后回到这里登录。
        </Alert>
        <Link to="/login" className="mt-6 block">
          <Button fullWidth size="lg">
            去登录
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="学生注册" subtitle="需要老师发的邀请码才能注册，注册后会自动归到该老师名下">
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="邀请码"
          placeholder="PRON-XXXXXXXX"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          hint="邀请码不区分大小写，请向你的老师索取"
          required
        />
        <TextField
          label="你的姓名"
          placeholder="例如：李明"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
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
          label="设置密码"
          type="password"
          autoComplete="new-password"
          placeholder="至少 6 位"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          注册
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        已经有账号了？
        <Link to="/login" className="ml-1 font-medium text-brand-600 hover:text-brand-700">
          去登录
        </Link>
      </p>
    </AuthLayout>
  )
}
