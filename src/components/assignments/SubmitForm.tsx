import { useState } from 'react'
import { supabase, BUCKETS, buildStoragePath } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Alert, TextArea } from '@/components/ui/Field'
import { MediaRecorderPanel } from '@/components/media/MediaRecorderPanel'
import type { ArticleImage, Assignment } from '@/types'
import { cn } from '@/utils/cn'
import { formatBytes } from '@/utils/format'
import { extensionForMime } from '@/utils/media'

interface Props {
  assignment: Assignment
  nextVersion: number
  onSubmitted: () => void
}

/** iPhone 默认拍出的 HEIC，Chrome/Android/Windows 都解不开，老师那边会是一张破图 */
const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)

/**
 * 学生提交：上传文章图片 + 朗读音频/视频。
 * 每次提交生成一个新版本，历史版本全部保留，方便对比进步。
 */
export function SubmitForm({ assignment, nextVersion, onSubmitted }: Props) {
  const { profile } = useAuth()
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [heicNames, setHeicNames] = useState<string[]>([])

  const addFiles = (picked: FileList | null) => {
    if (!picked?.length) return
    const list = Array.from(picked).filter((f) => f.type.startsWith('image/'))
    const heic = list.filter(isHeic).map((f) => f.name)
    if (heic.length) setHeicNames((prev) => [...new Set([...prev, ...heic])])
    setFiles((prev) => [...prev, ...list])
    setPreviews((prev) => [...prev, ...list.map((f) => URL.createObjectURL(f))])
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadOne = async (blob: Blob, fileName: string) => {
    const path = buildStoragePath({
      teacherId: assignment.teacher_id,
      studentId: assignment.student_id,
      assignmentId: assignment.id,
      fileName,
    })
    const { error: upErr } = await supabase.storage.from(BUCKETS.submissions).upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || undefined,
    })
    if (upErr) throw new Error(`上传 ${fileName} 失败：${upErr.message}`)
    return path
  }

  const readImageSize = (url: string) =>
    new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = url
    })

  const handleSubmit = async () => {
    if (!profile) return
    if (!files.length) {
      setError('请至少上传一张文章图片。')
      return
    }
    if (!audioBlob && !videoBlob) {
      setError('请录制朗读音频或视频。')
      return
    }

    setBusy(true)
    setError(null)
    try {
      setProgress('正在上传文章图片…')
      const images: ArticleImage[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const path = await uploadOne(f, f.name)
        const dim = await readImageSize(previews[i])
        images.push({ path, name: f.name, ...dim })
      }

      let audioPath: string | null = null
      let videoPath: string | null = null

      if (audioBlob) {
        setProgress('正在上传朗读音频…')
        // 后缀跟真实编码走：iOS Safari 录出来是 mp4，写死 webm 会让文件打不开
        audioPath = await uploadOne(
          audioBlob,
          `reading-v${nextVersion}.${extensionForMime(audioBlob.type, 'audio')}`,
        )
      }
      if (videoBlob) {
        setProgress('正在上传朗读视频…')
        videoPath = await uploadOne(
          videoBlob,
          `reading-v${nextVersion}.${extensionForMime(videoBlob.type, 'video')}`,
        )
      }

      setProgress('正在保存提交记录…')
      const { error: insErr } = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        student_id: profile.id,
        version: nextVersion,
        article_images: images,
        audio_path: audioPath,
        video_path: videoPath,
        note: note.trim() || null,
      })
      if (insErr) throw new Error(insErr.message)

      // 交给老师批改
      const { error: updErr } = await supabase
        .from('assignments')
        .update({ status: 'submitted' })
        .eq('id', assignment.id)
      if (updErr) throw new Error(updErr.message)

      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请重试。')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">1. 上传文章图片</h3>
        <p className="mt-1 text-sm text-slate-500">可以拍多张，老师会直接在图上面做标记。</p>

        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 transition-colors hover:border-brand-400 hover:bg-brand-50/40">
          <span className="text-2xl">🖼</span>
          <span className="mt-2 text-sm font-medium text-slate-700">点击选择或拍照</span>
          <span className="mt-1 text-xs text-slate-500">手机可直接调起相机拍摄，也可以从相册选</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        {heicNames.length > 0 && (
          <div className="mt-3">
            <Alert tone="warning">
              检测到 iPhone 的 HEIC 格式图片（{heicNames.join('、')}）。
              老师用的电脑浏览器可能打不开这种图，会显示成空白。
              请到手机「设置 → 相机 → 格式」选择<strong>「兼容性最佳」</strong>后重拍，
              或先把图片转成 JPG 再上传。
            </Alert>
          </div>
        )}

        {previews.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {previews.map((src, i) => (
              <li key={src} className="group relative overflow-hidden rounded-xl ring-1 ring-slate-200">
                <img src={src} alt={`文章 ${i + 1}`} className="h-32 w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-900/70 px-2 py-1 text-xs text-white">
                  <span className="truncate">{formatBytes(files[i]?.size ?? 0)}</span>
                  <button type="button" onClick={() => removeFile(i)} className="hover:text-rose-300">
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">2. 录制朗读</h3>
        <p className="mt-1 text-sm text-slate-500">音频和视频任选其一，也可以都录。</p>
        <div className={cn('mt-3 grid gap-4', 'md:grid-cols-2')}>
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">🎙 音频</p>
            <MediaRecorderPanel kind="audio" onRecorded={setAudioBlob} onClear={() => setAudioBlob(null)} />
          </div>
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">🎬 视频</p>
            <MediaRecorderPanel kind="video" onRecorded={setVideoBlob} onClear={() => setVideoBlob(null)} />
          </div>
        </div>
      </div>

      <TextArea
        label="3. 想对老师说的话（选填）"
        placeholder="例如：这次某几个单词我还是拿不准…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <Alert>{error}</Alert>}
      {progress && <Alert tone="info">{progress}</Alert>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} loading={busy} size="lg">
          提交第 {nextVersion} 版
        </Button>
        <span className="text-xs text-slate-500">提交后老师会在看板上收到通知</span>
      </div>
    </div>
  )
}
