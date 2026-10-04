import { Link } from 'react-router-dom'
import { StatusBadge } from '@/components/assignments/StatusBadge'
import { EmptyState } from '@/components/ui/Card'
import { BOARD_COLUMNS, type TeacherBoardRow } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateTime, formatDueLabel } from '@/utils/format'

export function TeacherBoard({ grouped }: { grouped: Record<string, TeacherBoardRow[]> }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((col) => {
        const rows = grouped[col.status] ?? []
        return (
          <section key={col.status} className="flex flex-col rounded-2xl bg-slate-100/70 p-3">
            <header className="mb-3 flex items-center justify-between px-1">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                <p className="text-xs text-slate-500">{col.hint}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {rows.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2.5">
              {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                  暂无
                </p>
              ) : (
                rows.map((row) => <BoardCard key={row.assignment_id} row={row} />)
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({ row }: { row: TeacherBoardRow }) {
  const due = formatDueLabel(row.due_at, row.is_overdue)

  return (
    <Link
      to={`/assignments/${row.assignment_id}`}
      className={cn(
        'block rounded-xl bg-white p-3.5 ring-1 ring-slate-200 shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:ring-brand-300 hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{row.title}</p>
        <StatusBadge status={row.status} />
      </div>

      <p className="mt-1.5 text-xs text-slate-500">
        {row.student_name}
        {row.latest_version ? ` · 第 ${row.latest_version} 版` : ''}
      </p>

      <div className="mt-2.5 flex items-center justify-between text-xs">
        <span
          className={cn(
            'font-medium',
            due.tone === 'danger' ? 'text-rose-600' : due.tone === 'warning' ? 'text-amber-600' : 'text-slate-500',
          )}
        >
          {due.text}
        </span>
        <span className="text-slate-400">
          {formatDateTime(row.latest_submitted_at ?? row.created_at)}
        </span>
      </div>
    </Link>
  )
}

export function BoardEmptyFallback() {
  return (
    <EmptyState
      title="还没有布置任何作业"
      description="创建第一份作业后，学生的提交会按状态自动流到这里。"
    />
  )
}
