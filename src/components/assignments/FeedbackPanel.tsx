import { useState } from 'react'
import { ImageAnnotator } from '@/components/annotation/ImageAnnotator'
import { Card } from '@/components/ui/Card'
import { useSignedUrls } from '@/hooks/useSignedUrl'
import { BUCKETS } from '@/lib/supabase'
import type { Feedback, Submission } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  submission: Submission
  feedback: Feedback | null
  readOnly?: boolean
}

/**
 * 学生端查看反馈：文章图片 + 老师画在图片上的批注 + 老师的语音/视频讲解。
 * readOnly 时画布只负责渲染，不能编辑。
 */
export function FeedbackPanel({ submission, feedback, readOnly = true }: Props) {
  const imagePaths = submission.article_images.map((i) => i.path)
  const imageUrls = useSignedUrls(BUCKETS.submissions, imagePaths)

  const feedbackAudio = useSignedUrls(BUCKETS.feedback, feedback?.audio_path ? [feedback.audio_path] : [])
  const feedbackVideo = useSignedUrls(BUCKETS.feedback, feedback?.video_path ? [feedback.video_path] : [])
  const studentAudio = useSignedUrls(BUCKETS.submissions, submission.audio_path ? [submission.audio_path] : [])
  const studentVideo = useSignedUrls(BUCKETS.submissions, submission.video_path ? [submission.video_path] : [])

  const [activeImage, setActiveImage] = useState(0)

  return (
    <div className="space-y-4">
      {feedback ? (
        <Card className="border-l-4 border-l-brand-500">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">老师总评</h3>
            <span className="text-xs text-slate-500">{formatDateTime(feedback.created_at)}</span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">
            {feedback.overall_comment || '（老师未填写文字总评）'}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {feedbackAudio[0] && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">🎙 语音讲解</p>
                <audio src={feedbackAudio[0]} controls className="w-full" />
              </div>
            )}
            {feedbackVideo[0] && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">🎬 视频讲解</p>
                <video src={feedbackVideo[0]} controls className="w-full rounded-lg" />
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">老师还没有发布这一版的反馈，请耐心等待。</p>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          老师在图上的批注（{feedback?.annotations?.length ?? 0} 条）
        </h3>

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
            annotations={feedback?.annotations ?? []}
            onChange={() => undefined}
            readOnly={readOnly}
          />
        ) : (
          <p className="text-sm text-slate-400">图片加载中…</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          我这一版的朗读（第 {submission.version} 版）
        </h3>
        <div className="space-y-3">
          {studentAudio[0] && <audio src={studentAudio[0]} controls className="w-full" />}
          {studentVideo[0] && <video src={studentVideo[0]} controls className="w-full rounded-lg" />}
          {submission.note && (
            <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
              我的留言：{submission.note}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
