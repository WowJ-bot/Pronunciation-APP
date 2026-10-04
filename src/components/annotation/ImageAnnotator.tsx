import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreenSupported,
  pressureOf,
  releaseWakeLock,
  requestWakeLock,
  widthFactor,
} from '@/utils/stylus'
import type { Annotation, AnnotationType } from '@/types'

const TOOLS: Array<{ type: AnnotationType; label: string; icon: string }> = [
  { type: 'pen', label: '画笔', icon: '✎' },
  { type: 'circle', label: '圈选', icon: '◯' },
  { type: 'rect', label: '方框', icon: '▭' },
  { type: 'arrow', label: '箭头', icon: '↗' },
  { type: 'text', label: '文字', icon: 'T' },
]

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#0f172a']

/** 笔画上的一个采样点。w 是压感粗细倍率，无压感设备不写该字段。 */
type StrokePoint = { x: number; y: number; w?: number }

let seq = 0
const nextId = () => `an_${Date.now().toString(36)}_${seq++}`

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

interface Props {
  imageUrl: string
  /** 当前是第几张图，写入批注的 imageIndex 用于多图场景 */
  imageIndex: number
  annotations: Annotation[]
  onChange: (next: Annotation[]) => void
  readOnly?: boolean
}

export function ImageAnnotator({ imageUrl, imageIndex, annotations, onChange, readOnly = false }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState<AnnotationType>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [textValue, setTextValue] = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  // 正在画的那一笔放在 ref 而不是 state 里：
  // Apple Pencil 在 120Hz 上会连续投递大量采样点，走 setState 会触发整棵子树重渲染，
  // 手感会明显发涩。改为「改动 ref + rAF 重绘」。
  const draftRef = useRef<Annotation | null>(null)
  const drawingPointerRef = useRef<number | null>(null)
  const penActiveRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  // 只处理当前这张图的批注
  const mine = useMemo(
    () => annotations.filter((a) => a.imageIndex === imageIndex),
    [annotations, imageIndex],
  )

  const commit = useCallback(
    (next: Annotation[]) => onChange([...annotations.filter((a) => a.imageIndex !== imageIndex), ...next]),
    [annotations, imageIndex, onChange],
  )

  // 跟随容器尺寸，保证批注在任何设备上都对齐
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [imageUrl])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    const nextW = Math.round(size.w * dpr)
    const nextH = Math.round(size.h * dpr)
    // 只在尺寸真变了时才写 width/height，赋值会清空画布并重置 state
    if (canvas.width !== nextW) canvas.width = nextW
    if (canvas.height !== nextH) canvas.height = nextH

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    for (const a of mine) drawAnnotation(ctx, a, size)
    if (draftRef.current) drawAnnotation(ctx, draftRef.current, size)
  }, [mine, size])

  const redrawRef = useRef(redraw)
  useLayoutEffect(() => {
    redrawRef.current = redraw
  })
  useEffect(() => {
    redraw()
  }, [redraw])

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      redrawRef.current()
    })
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  /** 把指针事件换算成 0~1 的相对坐标（手写笔额外带上压感） */
  const pointFrom = (native: PointerEvent): StrokePoint => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = clamp01((native.clientX - rect.left) / rect.width)
    const y = clamp01((native.clientY - rect.top) / rect.height)
    // 只有 pen 才写压感：鼠标/手指的 pressure 无意义，写了反而会让笔画粗细乱跳
    return native.pointerType === 'pen' ? { x, y, w: widthFactor(pressureOf(native)) } : { x, y }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return
    const native = e.nativeEvent
    const isPenDown = native.pointerType === 'pen'

    // 掌纹抑制：笔正在书写时，手掌/手指的触摸一律丢弃。
    // iPad 上少了这一条，手腕一压就会打断笔画或留下一道多余的痕迹。
    if (penActiveRef.current && !isPenDown) return

    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(native.pointerId)
    } catch {
      /* 部分浏览器在指针已释放时会抛错，忽略即可 */
    }

    const p = pointFrom(native)

    if (tool === 'text') {
      const text = textValue.trim()
      if (!text) return
      commit([...mine, { id: nextId(), type: 'text', color, imageIndex, text, anchor: p, createdAt: Date.now() }])
      setTextValue('')
      return
    }

    drawingPointerRef.current = native.pointerId
    if (isPenDown) penActiveRef.current = true

    const base: Annotation = { id: nextId(), type: tool, color, imageIndex, createdAt: Date.now() }
    if (tool === 'pen') draftRef.current = { ...base, points: [p] }
    else if (tool === 'rect' || tool === 'circle')
      draftRef.current = { ...base, rect: { x: p.x, y: p.y, w: 0, h: 0 } }
    else draftRef.current = { ...base, points: [p, p] }

    scheduleRedraw()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const native = e.nativeEvent
    if (drawingPointerRef.current === null || native.pointerId !== drawingPointerRef.current) return
    const draft = draftRef.current
    if (!draft) return

    // 高刷新率设备一次事件会携带多个采样点，丢掉它们快速书写时会变成折线
    const coalesced =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    const samples: PointerEvent[] = coalesced.length > 0 ? coalesced : [native]

    if (draft.type === 'pen') {
      const points: StrokePoint[] = draft.points ? [...draft.points] : []
      for (const s of samples) points.push(pointFrom(s))
      draftRef.current = { ...draft, points }
    } else if (draft.rect) {
      const p = pointFrom(native)
      draftRef.current = { ...draft, rect: { ...draft.rect, w: p.x - draft.rect.x, h: p.y - draft.rect.y } }
    } else if (draft.points) {
      const p = pointFrom(native)
      draftRef.current = { ...draft, points: [draft.points[0], p] }
    }

    scheduleRedraw()
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointerRef.current !== e.nativeEvent.pointerId) return
    drawingPointerRef.current = null
    penActiveRef.current = false

    const draft = draftRef.current
    draftRef.current = null
    if (!draft) {
      scheduleRedraw()
      return
    }

    const isTooSmall =
      (draft.rect && Math.abs(draft.rect.w) < 0.01 && Math.abs(draft.rect.h) < 0.01) ||
      (draft.points && draft.points.length < 2)

    if (!isTooSmall) commit([...mine, draft])
    else scheduleRedraw()
  }

  const undo = () => mine.length && commit(mine.slice(0, -1))
  const clear = () => mine.length && commit([])

  // 全屏批注：在浏览器里也能像 App 一样专注书写；进入时保持屏幕常亮
  const fsSupported = isFullscreenSupported()
  useEffect(() => {
    const onChangeFs = () => {
      const on = document.fullscreenElement === panelRef.current
      setFullscreen(on)
      if (on) void requestWakeLock()
      else void releaseWakeLock()
    }
    document.addEventListener('fullscreenchange', onChangeFs)
    return () => {
      document.removeEventListener('fullscreenchange', onChangeFs)
      void releaseWakeLock()
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (fullscreen) await exitFullscreen()
      else if (panelRef.current) await enterFullscreen(panelRef.current)
    } catch {
      /* 非用户手势触发或浏览器拒绝时忽略 */
    }
  }

  return (
    <div ref={panelRef} className="annotator-panel space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <div className="flex items-center gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => setTool(t.type)}
                title={t.label}
                className={cn(
                  'flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium transition-colors',
                  tool === t.type ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-white',
                )}
              >
                <span aria-hidden>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`颜色 ${c}`}
                className={cn(
                  'h-6 w-6 rounded-full ring-2 transition-transform',
                  color === c ? 'scale-110 ring-slate-800' : 'ring-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {fsSupported && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-white"
              >
                {fullscreen ? '退出全屏' : '全屏批注'}
              </button>
            )}
            <button
              type="button"
              onClick={undo}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-white"
            >
              撤销
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
            >
              清空
            </button>
          </div>

          {tool === 'text' && (
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="输入文字后点击图片放置"
              className="w-full rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          )}
        </div>
      )}

      <div className="annotator-stage">
        <div
          ref={wrapRef}
          className="annotator-canvas-box relative w-full select-none overflow-hidden rounded-xl ring-1 ring-slate-200"
        >
          <img src={imageUrl} alt="文章图片" className="block w-full" draggable={false} />
          <canvas
            ref={canvasRef}
            style={{
              width: size.w,
              height: size.h,
              // 关键：不加这条，手指或笔一划会被浏览器当成「滚动页面」，
              // 画到一半触发 pointercancel —— 平板上批注能不能用就看这一条
              touchAction: 'none',
            }}
            className={cn('absolute inset-0', readOnly ? 'pointer-events-none' : 'cursor-crosshair')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
        </div>
      </div>

      <p className="annotator-hint text-xs text-slate-500">
        共 {mine.length} 条批注 · 坐标按比例保存，手机和平板上都会自动对齐
        {!readOnly && ' · 支持 Apple Pencil / S Pen 等手写笔，笔迹随力度变化'}
      </p>
    </div>
  )
}

function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, size: { w: number; h: number }) {
  const { w, h } = size
  ctx.save()
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  const baseWidth = Math.max(2, h * 0.006)
  ctx.lineWidth = baseWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (a.type === 'pen' && a.points?.length) {
    strokeByPressure(ctx, a.points, w, h, baseWidth)
  } else if (a.type === 'rect' && a.rect) {
    ctx.strokeRect(a.rect.x * w, a.rect.y * h, a.rect.w * w, a.rect.h * h)
  } else if (a.type === 'circle' && a.rect) {
    ctx.beginPath()
    ctx.ellipse(
      (a.rect.x + a.rect.w / 2) * w,
      (a.rect.y + a.rect.h / 2) * h,
      Math.abs(a.rect.w / 2) * w,
      Math.abs(a.rect.h / 2) * h,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
  } else if (a.type === 'arrow' && a.points?.length === 2) {
    const [p0, p1] = a.points
    const x0 = p0.x * w
    const y0 = p0.y * h
    const x1 = p1.x * w
    const y1 = p1.y * h
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    const angle = Math.atan2(y1 - y0, x1 - x0)
    const head = Math.max(8, h * 0.022)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 7), y1 - head * Math.sin(angle - Math.PI / 7))
    ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 7), y1 - head * Math.sin(angle + Math.PI / 7))
    ctx.closePath()
    ctx.fill()
  } else if (a.type === 'text' && a.text && a.anchor) {
    const fontSize = Math.max(14, h * 0.035)
    ctx.font = `600 ${fontSize}px 'PingFang SC', 'Microsoft YaHei', sans-serif`
    const x = a.anchor.x * w
    const y = a.anchor.y * h
    const padding = fontSize * 0.35
    const metrics = ctx.measureText(a.text)
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.fillRect(x - padding, y - fontSize, metrics.width + padding * 2, fontSize * 1.35)
    ctx.fillStyle = a.color
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(a.text, x, y)
  }

  ctx.restore()
}

/**
 * 按压感逐段描边。
 * 无压感设备（手指、鼠标、被动电容笔）的点没有 w，按 1 倍基准线宽绘制，
 * 与升级前保存的老批注完全兼容。
 */
function strokeByPressure(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; w?: number }>,
  w: number,
  h: number,
  baseWidth: number,
) {
  if (points.length < 2) return

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const widthA = baseWidth * (a.w ?? 1)
    const widthB = baseWidth * (b.w ?? 1)
    ctx.beginPath()
    ctx.lineWidth = (widthA + widthB) / 2
    ctx.moveTo(a.x * w, a.y * h)
    ctx.lineTo(b.x * w, b.y * h)
    ctx.stroke()
  }
}
