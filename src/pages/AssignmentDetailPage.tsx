import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAssignmentDetail } from '@/hooks/useAssignments'
import { StatusBadge } from '@/components/assignments/StatusBadge'
import { SubmitForm } from '@/components/assignments/SubmitForm'
import { FeedbackPanel } from '@/components/assignments/FeedbackPanel'
import { ReviewWorkspace } from '@/components/assignments/ReviewWorkspace'
import { Button, Spinner } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Field'
import type { Feedback, Profile, Submission } from '@/types'
import { formatDateTime, formatDueLabel } from '@/utils/format'
import { cn } from '@/utils/cn'

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile, isTeacher } = useAuth()
  const { assignment, submissions, feedbackBySubmission, loading, error, reload } = useAssignmentDetail(id)

  const [student, setStudent] = useState<Profile | null>(null)

  // 老师视角需要知道这作业是谁的
  useEffect(() => {
    if (!isTeacher || !assignment) return
    void supabase
      .from('profiles')
      .select('*')
      .eq('id', assignment.student_id)
      .maybeSingle()
      .then(({ data }) => setStudent((data as Profile) ?? null))
  }, [isTeacher, assignment])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-brand-600">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <EmptyState
        title="找不到这份作业"
        description={error ?? '它可能已被删除，或者你没有查看权限。'}
        action={
          <Link to="/">
            <Button variant="secondary">返回首页</Button>
          </Link>
        }
      />
    )
  }

  const latest = submissions[0] as Submission | undefined
  const latestFeedback = latest
    ? ((feedbackBySubmission[latest.id] as Feedback | undefined) ?? null)
    : null
  const nextVersion = (latest?.version ?? 0) + 1
  const due = formatDueLabel(assignment.due_at)

  return (
    <div className="space-y-6">
      <Link to={isTeacher ? '/board' : '/assignments'} className="text-sm text-slate-500 hover:text-brand-600">
        ← 返回{isTeacher ? '看板' : '作业列表'}
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{assignment.title}</h1>
              <StatusBadge status={assignment.status} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {isTeacher && student ? `学生：${student.full_name} · ` : ''}
              布置于 {formatDateTime(assignment.created_at)}
              {assignment.due_at && (
                <span
                  className={cn(
                    'ml-2 font-medium',
                    due.tone === 'danger' ? 'text-rose-600' : due.tone === 'warning' ? 'text-amber-600' : '',
                  )}
                >
                  {due.text}
                </span>
              )}
            </p>
            {assignment.description && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm whitespace-pre-wrap text-slate-700">
                {assignment.description}
              </p>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={reload}>
            刷新
          </Button>
        </div>
      </Card>

      {/* ——————— 老师视角：批改 ——————— */}
      {isTeacher &&
        (latest ? (
          <ReviewWorkspace
            assignment={assignment}
            submission={latest}
            existingFeedback={latestFeedback}
            onSaved={reload}
          />
        ) : (
          <EmptyState title="学生还没有提交" description="学生提交后，这里会出现文章图片和朗读音视频。" />
        ))}

      {/* ——————— 学生视角：看反馈 + 重新提交 ——————— */}
      {!isTeacher && (
        <>
          {latest ? (
            <FeedbackPanel submission={latest} feedback={latestFeedback} readOnly />
          ) : (
            <Alert tone="info">还没有提交记录，请在下方上传文章图片并录制朗读。</Alert>
          )}

          {['pending', 'revising', 'feedback_ready'].includes(assignment.status) && (
            <Card>
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                {latest ? `重新录制第 ${nextVersion} 版` : '开始第一次提交'}
              </h2>
              <p className="mb-5 text-sm text-slate-500">
                听完老师的讲解后，按批注再练一遍录上来，历史版本会全部保留。
              </p>
              <SubmitForm assignment={assignment} nextVersion={nextVersion} onSubmitted={reload} />
            </Card>
          )}

          {assignment.status === 'submitted' && (
            <Alert tone="info">已提交，等待老师批改。老师发布反馈后这里会显示批注和讲解。</Alert>
          )}

          {submissions.length > 1 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">历史版本</h2>
              <ul className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-slate-700">第 {s.version} 版</span>
                    <span className="text-xs text-slate-400">{formatDateTime(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
