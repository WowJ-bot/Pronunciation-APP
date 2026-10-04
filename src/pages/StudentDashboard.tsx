import { Link } from 'react-router-dom'
import { useStudentAssignments } from '@/hooks/useAssignments'
import { StatusBadge } from '@/components/assignments/StatusBadge'
import { Spinner } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Field'
import { formatDateTime, formatDueLabel } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Assignment } from '@/types'

export default function StudentDashboard() {
  const { assignments, loading, error } = useStudentAssignments()

  const todo = assignments.filter((a) => ['pending', 'revising'].includes(a.status))
  const waiting = assignments.filter((a) => ['submitted', 'reviewing'].includes(a.status))
  const needRevision = assignments.filter((a) => ['feedback_ready'].includes(a.status))
  const completed = assignments.filter((a) => a.status === 'completed')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">我的作业</h1>
        <p className="mt-1 text-sm text-slate-500">
          共 {assignments.length} 份 · 待我动手 {todo.length + needRevision.length} 份 · 等老师反馈 {waiting.length} 份
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-brand-600">
          <Spinner className="h-7 w-7" />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState title="老师还没有给你布置作业" description="有作业时这里会自动出现。" />
      ) : (
        <div className="space-y-6">
          {needRevision.length > 0 && (
            <Group title="老师已反馈，等你修改" highlight>
              {needRevision.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </Group>
          )}

          {todo.length > 0 && (
            <Group title="待提交">
              {todo.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </Group>
          )}

          {waiting.length > 0 && (
            <Group title="已提交，等老师批改">
              {waiting.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </Group>
          )}

          {completed.length > 0 && (
            <Group title="已完成">
              {completed.map((a) => (
                <AssignmentRow key={a.id} assignment={a} />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  children,
  highlight,
}: {
  title: string
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <section>
      <h2
        className={cn(
          'mb-3 text-sm font-semibold',
          highlight ? 'text-brand-700' : 'text-slate-700',
        )}
      >
        {title}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function AssignmentRow({ assignment }: { assignment: Assignment }) {
  const due = formatDueLabel(assignment.due_at)

  return (
    <Link to={`/assignments/${assignment.id}`} className="block">
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:ring-brand-300 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{assignment.title}</h3>
          <StatusBadge status={assignment.status} />
        </div>
        {assignment.description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">{assignment.description}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span
            className={cn(
              'font-medium',
              due.tone === 'danger' ? 'text-rose-600' : due.tone === 'warning' ? 'text-amber-600' : 'text-slate-500',
            )}
          >
            {due.text}
          </span>
          <span className="text-slate-400">布置于 {formatDateTime(assignment.created_at)}</span>
        </div>
      </Card>
    </Link>
  )
}
