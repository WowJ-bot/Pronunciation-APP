import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Assignment, AssignmentStatus, Submission, TeacherBoardRow } from '@/types'

/** 老师看板：一次拉全量，前端按状态分组 */
export function useTeacherBoard() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<TeacherBoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('teacher_board')
      .select('*')
      .order('latest_submitted_at', { ascending: false, nullsFirst: false })

    if (err) setError(err.message)
    else setRows((data ?? []) as TeacherBoardRow[])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = rows.reduce<Record<AssignmentStatus, TeacherBoardRow[]>>(
    (acc, row) => {
      const key = row.status === 'reviewing' ? 'submitted' : row.status === 'revising' ? 'feedback_ready' : row.status
      acc[key] = [...(acc[key] ?? []), row]
      return acc
    },
    { pending: [], submitted: [], reviewing: [], feedback_ready: [], revising: [], completed: [] },
  )

  return { rows, grouped, loading, error, reload: load }
}

/** 学生端：自己的作业列表 */
export function useStudentAssignments() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('assignments')
      .select('*')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })

    if (err) setError(err.message)
    else setAssignments((data ?? []) as Assignment[])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  return { assignments, loading, error, reload: load }
}

/** 单个作业详情：作业本身 + 全部历史版本 + 每个版本的反馈 */
export function useAssignmentDetail(assignmentId?: string) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [feedbackBySubmission, setFeedbackBySubmission] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!assignmentId) return
    setLoading(true)
    setError(null)

    const { data: a, error: aErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle()
    if (aErr) {
      setError(aErr.message)
      setLoading(false)
      return
    }
    setAssignment((a as Assignment) ?? null)

    const { data: subs, error: sErr } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('version', { ascending: false })
    if (sErr) {
      setError(sErr.message)
      setLoading(false)
      return
    }
    const list = (subs ?? []) as Submission[]
    setSubmissions(list)

    if (list.length) {
      const { data: fb } = await supabase
        .from('feedback')
        .select('*')
        .in(
          'submission_id',
          list.map((s) => s.id),
        )
      const map: Record<string, unknown> = {}
      for (const row of fb ?? []) map[(row as { submission_id: string }).submission_id] = row
      setFeedbackBySubmission(map)
    } else {
      setFeedbackBySubmission({})
    }

    setLoading(false)
  }, [assignmentId])

  useEffect(() => {
    void load()
  }, [load])

  return { assignment, submissions, feedbackBySubmission, loading, error, reload: load }
}
