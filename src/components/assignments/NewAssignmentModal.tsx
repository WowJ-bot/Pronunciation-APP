import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert, TextField, TextArea } from '@/components/ui/Field'
import type { Profile } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

/** 老师布置作业：选学生 + 填标题要求 + 截止时间 */
export function NewAssignmentModal({ open, onClose, onCreated }: Props) {
  const { profile } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [studentId, setStudentId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 每次打开弹窗时拉一次学生名单，避免用陈旧数据
  useEffect(() => {
    if (!open || !profile) return
    let active = true
    void supabase
      .from('profiles')
      .select('*')
      .eq('teacher_id', profile.id)
      .order('full_name')
      .then(({ data }) => {
        if (!active) return
        const list = (data ?? []) as Profile[]
        setStudents(list)
        setStudentId((prev) => (list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? '')))
      })
    return () => {
      active = false
    }
  }, [open, profile])

  const reset = () => {
    setTitle('')
    setDescription('')
    setDueAt('')
    setError(null)
  }

  const handleCreate = async () => {
    if (!profile) return
    if (!studentId) return setError('请选择学生。')
    if (!title.trim()) return setError('请填写作业标题。')

    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('assignments').insert({
      teacher_id: profile.id,
      student_id: studentId,
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      status: 'pending',
    })
    setBusy(false)

    if (err) return setError(err.message)
    reset()
    onCreated()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="布置新作业"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleCreate} loading={busy}>
            布置作业
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {students.length === 0 ? (
          <Alert tone="info">
            还没有学生加入。请先到「邀请码」页面生成邀请码并发给学生，等学生完成注册后再布置作业。
          </Alert>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">选择学生</span>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}（{s.email}）
                </option>
              ))}
            </select>
          </label>
        )}

        <TextField
          label="作业标题"
          placeholder="例如：Lesson 3 短文朗读 —— The Fox and the Crow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <TextArea
          label="朗读要求"
          placeholder="例如：注意 th 的咬舌音、词尾复数 -s 的清浊，语速放慢，先读三遍再录。"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <TextField
          label="截止时间（选填）"
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />

        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  )
}
