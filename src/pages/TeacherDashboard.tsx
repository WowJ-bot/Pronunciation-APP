import { useState } from 'react'
import { useTeacherBoard } from '@/hooks/useAssignments'
import { TeacherBoard } from '@/components/assignments/TeacherBoard'
import { NewAssignmentModal } from '@/components/assignments/NewAssignmentModal'
import { Button, Spinner } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Field'

export default function TeacherDashboard() {
  const { rows, grouped, loading, error, reload } = useTeacherBoard()
  const [creating, setCreating] = useState(false)

  const pendingCount = grouped.submitted?.length ?? 0
  const awaitingRevision = grouped.feedback_ready?.length ?? 0
  const doneCount = grouped.completed?.length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">任务看板</h1>
          <p className="mt-1 text-sm text-slate-500">
            所有作业按状态自动归档，点卡片即可进入批改。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}>
            刷新
          </Button>
          <Button onClick={() => setCreating(true)} icon={<span>＋</span>}>
            布置新作业
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="总作业数" value={rows.length} />
        <Stat label="待批改" value={pendingCount} tone="warning" />
        <Stat label="等待学生修改" value={awaitingRevision} tone="brand" />
        <Stat label="已完成" value={doneCount} tone="success" />
      </div>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-brand-600">
          <Spinner className="h-7 w-7" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="看板还是空的"
          description="先在「邀请码」页面把邀请码发给学生，学生注册后就能给他们布置作业了。"
          action={<Button onClick={() => setCreating(true)}>布置第一份作业</Button>}
        />
      ) : (
        <TeacherBoard grouped={grouped} />
      )}

      <NewAssignmentModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'warning' | 'brand' | 'success'
}) {
  const tones = {
    neutral: 'text-slate-900',
    warning: 'text-amber-600',
    brand: 'text-brand-600',
    success: 'text-emerald-600',
  }
  return (
    <Card>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  )
}
