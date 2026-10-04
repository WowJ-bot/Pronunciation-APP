import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button, Spinner } from '@/components/ui/Button'
import { Card, CardHeader, EmptyState } from '@/components/ui/Card'
import { Alert, TextField } from '@/components/ui/Field'
import type { InviteCode } from '@/types'
import { formatDate } from '@/utils/format'

export default function InviteCodesPage() {
  const { profile } = useAuth()
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setCodes((data ?? []) as InviteCode[])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('create_invite_code', {
      p_note: note.trim() || null,
      p_max_uses: maxUses,
      p_days: days,
    })
    setBusy(false)
    if (err) return setError(err.message)
    setNote('')
    await load()
    if (typeof data === 'string') void copy(data)
  }

  const copy = async (code: string) => {
    const link = `${window.location.origin}/register?code=${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('复制失败，请手动复制：' + link)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">邀请码</h1>
        <p className="mt-1 text-sm text-slate-500">
          只有持邀请码的学生才能注册。学生注册时会自动归到你的名下。
        </p>
      </div>

      <Card>
        <CardHeader title="生成新邀请码" description="可以先发给某位学生，也可以一次发多个" />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="备注（选填）"
            placeholder="例如：张伟"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <TextField
            label="可用次数"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
          />
          <TextField
            label="有效天数"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-4">
          <Button onClick={create} loading={busy}>
            生成邀请码
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="已生成的邀请码" description={`共 ${codes.length} 个`} />
        {loading ? (
          <div className="flex h-32 items-center justify-center text-brand-600">
            <Spinner className="h-6 w-6" />
          </div>
        ) : codes.length === 0 ? (
          <EmptyState title="还没有邀请码" description="生成一个发给学生，他就能注册了。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">邀请码</th>
                  <th className="py-2 pr-4 font-medium">备注</th>
                  <th className="py-2 pr-4 font-medium">使用情况</th>
                  <th className="py-2 pr-4 font-medium">有效期至</th>
                  <th className="py-2 pr-4 font-medium">状态</th>
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs font-semibold text-slate-900">{c.code}</td>
                    <td className="py-3 pr-4 text-slate-600">{c.note || '—'}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {c.used_count} / {c.max_uses}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(c.expires_at)}</td>
                    <td className="py-3 pr-4">
                      {c.active ? (
                        <span className="text-emerald-600">可用</span>
                      ) : (
                        <span className="text-slate-400">已停用</span>
                      )}
                    </td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" onClick={() => copy(c.code)}>
                        {copied === c.code ? '已复制 ✓' : '复制注册链接'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
