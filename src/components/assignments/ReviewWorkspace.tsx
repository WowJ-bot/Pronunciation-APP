import { useEffect, useMemo, useState } from 'react'
import { supabase, BUCKETS } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSignedUrls } from '@/hooks/useSignedUrl'
import { ImageAnnotator } from '@/components/annotation/ImageAnnotator'
import { MediaRecorderPanel } from '@/components/media/MediaRecorderPanel'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert, TextArea } from '@/components/ui/Field'
import type { Annotation, Assignment, Feedback, Submission } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  assignment: Assignment
  submission: Submission
  existingFeedback: Feedback | null
  onSaved: () => void
}

/**
 * 老师批改工作区：在图上看批注 → 录讲解 → 发布反馈。
 * 反馈以 submission 为单位 upsert，同一版重复保存会覆盖而不是新增。
 */
export function ReviewWorkspace({ assignment, submission, existingFeedback, onSaved }: Props) {
  const { profile } = useAuth()
  const imageUrls = useSignedUrls(BUCKETS.submissions, submission.article_images.map((i) => i.path))
  const studentAudio = useSignedUrls(BUCKETS.submissions, submission.audio_path ? [submission.audio_path] : [])
  const studentVideo = useSignedUrls(BUCKETS.submissions, submission.video_path ? [submission.video_path] : [])

  const [annotations, setAnnotations] = useState<Annotation[]>(existingFeedback?.annotations ?? [])
  const [activeImage, setActiveImage] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [comment, setComment] = useState(existingFeedback?.overall_comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keepExistingMedia, setKeepExistingMedia] = useState(true)

  const existingAudioUrl = useSignedUrls(
    BUCKETS.feedback,
    existingFeedback?.audio_path && keepExistingMedia ? [existingFeedback.audio_path] : [],
  )[0]
  const existingVideoUrl = useSignedUrls(
    BUCKETS.feedback,
    existingFeedback?.video_path && keepExistingMedia ? [existingFeedback.video_path] : [],
  )[0]

  useEffect(() => {
    setAnnotations(existingFeedback?.annotations ?? [])
    setComment(existingFeedback?.overall_comment ?? '')
    setKeepExistingMedia(true)
  }, [existingFeedback?.id, submission.id])

  const annotationCount = useMemo(() => annotations.length, [annotations])

  const upload = async (blob: Blob, name: string) => {
    const path = `${assignment.teacher_id}/${assignment.student_id}/${assignment.id}/${Date.now()}-${name}`
    const { error: err } = await supabase.storage.from(BUCKETS.feedback).upload(path, blob, {
      contentType: blob.type || undefined,
      upsert: false,
    })
    if (err) throw new Error(`上传失败：${err.message}`)
    return path
  }

  const publish = async (nextStatus: 'feedback_ready' | 'completed') => {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      let audioPath = keepExistingMedia ? (existingFeedback?.audio_path ?? null) : null
      let videoPath = keepExistingMedia ? (existingFeedback?.video_path ?? null) : null

      if (audioBlob) audioPath = await upload(audioBlob, 'feedback-audio.webm')
      if (videoBlob) videoPath = await upload(videoBlob, 'feedback-video.webm')

      const payload = {
        submission_id: submission.id,
        teacher_id: profile.id,
        annotations,
        audio_path: audioPath,
        video_path: videoPath,
        overall_comment: comment.trim() || null,
      }

      const { error: fbErr } = await supabase
        .from('feedback')
        .upsert(payload, { onConflict: 'submission_id' })
      if (fbErr) throw new Error(fbErr.message)

      const { error: aErr } = await supabase
        .from('assignments')
        .update({ status: nextStatus })
        .eq('id', assignment.id)
      if (aErr) throw new Error(aErr.message)

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              学生第 {submission.version} 版提交
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">提交于 {formatDateTime(submission.created_at)}</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            已标记 {annotationCount} 条批注
          </span>
        </div>

        {submission.note && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
            学生留言：{submission.note}
          </p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {studentAudio[0] && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">🎙 学生朗读音频</p>
              <audio src={studentAudio[0]} controls className="w-full" />
            </div>
          )}
          {studentVideo[0] && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">🎬 学生朗读视频</p>
              <video src={studentVideo[0]} controls className="w-full rounded-lg" />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">在文章上做批注</h3>

        {imageUrls.length > 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {imageUrls.map((u, i) => (
              <button
                key={u}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${
                  activeImage === i ? 'ring-brand-500' : 'ring-slate-200'
                }`}
              >
                <img src={u} alt={`第 ${i + 1} 页`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {imageUrls[activeImage] ? (
          <ImageAnnotator
            imageUrl={imageUrls[activeImage]}
            imageIndex={activeImage}
            annotations={annotations}
            onChange={setAnnotations}
          />
        ) : (
          <p className="text-sm text-slate-400">图片加载中…</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">录制语音 / 视频讲解</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <p className="mb-2 text-sm font-medium text-slate-700">🎙 语音讲解</p>
            <MediaRecorderPanel
              kind="audio"
              existingUrl={existingAudioUrl ?? null}
              onRecorded={(b) => {
                setAudioBlob(b)
                setKeepExistingMedia(false)
              }}
              onClear={() => setAudioBlob(null)}
            />
          </div>
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <p className="mb-2 text-sm font-medium text-slate-700">🎬 视频讲解</p>
            <MediaRecorderPanel
              kind="video"
              existingUrl={existingVideoUrl ?? null}
              onRecorded={(b) => {
                setVideoBlob(b)
                setKeepExistingMedia(false)
              }}
              onClear={() => setVideoBlob(null)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <TextArea
          label="总评"
          placeholder="例如：整体流畅度比上一版好；th 音这次到位了，但 country 的重音还要往前放。"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => publish('feedback_ready')} loading={busy} size="lg">
            发布反馈，让学生修改
          </Button>
          <Button variant="success" size="lg" onClick={() => publish('completed')} loading={busy}>
            通过并结课
          </Button>
        </div>
      </Card>
    </div>
  )
}
