import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button, Spinner } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Field'
import type { Assignment, Profile } from '@/types'
import { formatDate } from '@/utils/format'

export default function StudentsPage() {
  const { profile } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [counts, setCounts] = useState<Record<string, { total: number; done: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)

    const { data, error: sErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false })

    if (sErr) {
      setError(sErr.message)
      setLoading(false)
      return
    }

    const list = (data ?? []) as Profile[]
    setStudents(list)

    if (list.length) {
      const { data: asg } = await supabase
        .from('assignments')
        .select('student_id,status')
        .in(
          'student_id',
          list.map((s) => s.id),
        )

      const map: Record<string, { total: number; done: number }> = {}
      for (const row of (asg ?? []) as Pick<Assignment, 'student_id' | 'status'>[]) {
        map[row.student_id] ??= { total: 0, done: 0 }
        map[row.student_id].total += 1
        if (row.status === 'completed') map[row.student_id].done += 1
      }
      setCounts(map)
    }

    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">我的学生</h1>
          <p className="mt-1 text-sm text-slate-500">通过邀请码注册的学生会自动出现在这里。</p>
        </div>
        <Button variant="secondary" onClick={load}>
          刷新
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-brand-600">
          <Spinner className="h-7 w-7" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          title="还没有学生加入"
          description="到「邀请码」页面生成一个邀请码，发给学生完成注册即可。"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => {
            const c = counts[s.id] ?? { total: 0, done: 0 }
            return (
              <Card key={s.id}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {s.full_name.slice(0, 1) || '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.full_name}</p>
                    <p className="truncate text-xs text-slate-500">{s.email}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>加入于 {formatDate(s.created_at)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {c.done} / {c.total} 已完成
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
