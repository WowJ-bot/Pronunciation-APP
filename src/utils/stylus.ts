/**
 * 手写笔与「像 App 一样运行」所需的设备能力封装。
 *
 * 核心判断：**手写笔跨品牌是统一的**。
 * Apple Pencil、三星 S Pen、华为 M-Pencil、小米 灵感笔、Surface Pen
 * 在浏览器里全部通过 Pointer Events 暴露压力与倾斜，
 * 所以这里按 `pointerType` 分支即可，不需要为任何品牌写专属代码。
 *
 * 唯一的硬件差异是「被动电容笔」没有压感——那不是代码能补的，
 * 走 `touch` 降级路径（笔画粗细固定）即可。
 */

export type PointerKind = 'pen' | 'touch' | 'mouse'

export function pointerKind(e: { pointerType?: string }): PointerKind {
  const type = e.pointerType
  if (type === 'pen') return 'pen'
  if (type === 'mouse') return 'mouse'
  return 'touch'
}

export function isPen(e: { pointerType?: string }): boolean {
  return pointerKind(e) === 'pen'
}

/**
 * 归一化压感到 0~1。
 *
 * 注意规范里的一个坑：**不支持压感的设备在「按下」时报告 0.5、「抬起」时报告 0**。
 * 所以 0 不能直接当成「最轻」，否则每一笔的末端都会突然收成一个尖点。
 */
export function pressureOf(e: { pressure?: number }): number {
  const p = e.pressure
  if (typeof p !== 'number' || p <= 0) return 0.5
  return Math.min(1, Math.max(0, p))
}

/** 压感 → 笔画粗细倍率。0.5（默认压感）约等于基准线宽 */
export function widthFactor(pressure: number): number {
  return 0.45 + pressure * 1.1
}

/** 环境是否具备 Pointer Events（几乎所有现代浏览器都有，仅用于界面提示） */
export function supportsPointerEvents(): boolean {
  return typeof window !== 'undefined' && 'PointerEvent' in window
}

/* ---------------------------------------------------------------- 全屏 */

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & { webkitFullscreenEnabled?: boolean }
  return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
}

export async function enterFullscreen(el: HTMLElement): Promise<void> {
  const target = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
  if (el.requestFullscreen) await el.requestFullscreen()
  else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen()
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
}

/* ----------------------------------------------------- 屏幕常亮（Wake Lock） */

type WakeLockSentinelLike = { release: () => Promise<void> }

let wakeLock: WakeLockSentinelLike | null = null

/**
 * 批注和录音期间保持屏幕常亮。
 * 学生念一段两分钟的文章，屏幕自己黑掉会让录制中断——这是很实际的坑。
 */
export async function requestWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock || wakeLock) return
    wakeLock = await nav.wakeLock.request('screen')
  } catch {
    /* 电量低、页面不可见或浏览器不支持时静默失败，不影响主流程 */
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release()
  } catch {
    /* 已释放则忽略 */
  }
  wakeLock = null
}
