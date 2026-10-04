import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { formatDuration } from '@/utils/format'
import {
  MEDIA_BLOCKER_TEXT,
  describeGetUserMediaError,
  detectMediaBlocker,
  extensionForMime,
  isMobile,
} from '@/utils/media'
import { releaseWakeLock, requestWakeLock } from '@/utils/stylus'

type Kind = 'audio' | 'video'

interface Props {
  kind: Kind
  maxSeconds?: number
  onRecorded: (blob: Blob) => void
  onClear?: () => void
  existingUrl?: string | null
  hint?: string
}

/**
 * 浏览器端录制音视频。
 *
 * 手机端有三个前置条件，缺一个就用不了（组件会提前探测并给出指引）：
 *   1. 页面是 https（或 localhost）—— http 下 mediaDevices 直接不存在
 *   2. 不是微信内置浏览器 —— 微信里调不起麦克风/摄像头，必须「在浏览器打开」
 *   3. 浏览器支持 MediaRecorder —— iOS 需 14.3+
 *
 * 编码格式按浏览器能力挑选：Android/Chrome 出 webm，iOS Safari 出 mp4。
 */
export function MediaRecorderPanel({
  kind,
  maxSeconds = 300,
  onRecorded,
  onClear,
  existingUrl,
  hint,
}: Props) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  // 默认前置：学生是「对着自己朗读」，后置摄像头拍不到人
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string>('')
  const timerRef = useRef<number | null>(null)
  const liveVideoRef = useRef<HTMLVideoElement>(null)

  const blocker = detectMediaBlocker()

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => stopStream, [stopStream])

  useEffect(() => {
    setPreviewUrl(existingUrl ?? null)
  }, [existingUrl])

  // 录制期间保持屏幕常亮：学生念一段长文时屏幕自动熄灭，会让人以为已经录完
  useEffect(() => {
    if (recording) void requestWakeLock()
    else void releaseWakeLock()
    return () => {
      void releaseWakeLock()
    }
  }, [recording])

  const start = async () => {
    setError(null)

    // 已知环境不支持就别去踩 getUserMedia 了，直接给准确指引
    const b = detectMediaBlocker()
    if (b) {
      setError(MEDIA_BLOCKER_TEXT[b])
      return
    }

    try {
      stopStream()
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'video'
          ? { video: { facingMode: facing }, audio: true }
          : { audio: { echoCancellation: true, noiseSuppression: true } },
      )
      streamRef.current = stream
      if (kind === 'video' && liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        await liveVideoRef.current.play().catch(() => undefined)
      }

      const mimeType = pickMimeType(kind)
      mimeRef.current = mimeType ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeRef.current || (kind === 'video' ? 'video/webm' : 'audio/webm')
        const blob = new Blob(chunksRef.current, { type })
        setPreviewUrl(URL.createObjectURL(blob))
        onRecorded(blob)
        stopStream()
        setRecording(false)
      }
      recorder.onerror = () => {
        setError('录制过程中断，请重试。')
        stopStream()
        setRecording(false)
      }

      // 带 timeslice：每秒落一个分片，手机录长音频时不会把整段攒在内存里
      recorder.start(1000)
      recorderRef.current = recorder
      setRecording(true)
      setSeconds(0)
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
          return s + 1
        })
      }, 1000)
    } catch (e) {
      setError(describeGetUserMediaError(e, kind))
      stopStream()
      setRecording(false)
    }
  }

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const reset = () => {
    setPreviewUrl(null)
    setSeconds(0)
    onClear?.()
  }

  const switchFacing = () => {
    setFacing((f) => (f === 'user' ? 'environment' : 'user'))
  }

  const canSwitchCamera = kind === 'video' && isMobile()
  const recordedExt = previewUrl ? extensionForMime(mimeRef.current, kind) : ''

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl bg-slate-900 p-4',
          kind === 'audio' && 'min-h-[120px]',
        )}
      >
        {kind === 'video' ? (
          recording ? (
            <video
              ref={liveVideoRef}
              muted
              playsInline
              className="max-h-72 w-full rounded-lg object-contain"
            />
          ) : previewUrl ? (
            <video src={previewUrl} controls playsInline className="max-h-72 w-full rounded-lg object-contain" />
          ) : (
            <p className="text-sm text-slate-400">摄像头未开启</p>
          )
        ) : previewUrl ? (
          <audio src={previewUrl} controls className="w-full" />
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-3xl">🎙</span>
            <span className="text-sm">点击开始录制</span>
          </div>
        )}

        {recording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-rose-600/90 px-3 py-1 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {formatDuration(seconds)} / {formatDuration(maxSeconds)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {blocker ? (
          <Button size="sm" disabled title="当前环境不支持网页录制">
            无法录制
          </Button>
        ) : !recording ? (
          <Button size="sm" onClick={start} icon={<span>●</span>}>
            {previewUrl ? '重新录制' : kind === 'video' ? '开始录像' : '开始录音'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={stop}>
            停止
          </Button>
        )}

        {canSwitchCamera && !recording && (
          <Button size="sm" variant="ghost" onClick={switchFacing}>
            {facing === 'user' ? '用后置摄像头' : '用前置摄像头'}
          </Button>
        )}

        {previewUrl && !recording && (
          <Button size="sm" variant="ghost" onClick={reset}>
            删除
          </Button>
        )}

        {previewUrl && !recording && recordedExt && (
          <span className="text-xs text-slate-400">{recordedExt.toUpperCase()} 已就绪</span>
        )}
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>

      {blocker && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
          {MEDIA_BLOCKER_TEXT[blocker]}
        </p>
      )}
      {error && <p className="text-xs leading-relaxed text-rose-600">{error}</p>}
    </div>
  )
}

/** 挑选浏览器支持的编码格式，Safari 与 Chrome 的可用项不同 */
function pickMimeType(kind: Kind): string | undefined {
  const candidates =
    kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  )
}
