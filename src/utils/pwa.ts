/**
 * PWA 相关的环境判断与注册。
 *
 * 设计原则：**这不是"另一个平台"**，只是同一份 Web 产物外面套的一层壳。
 * 业务代码不需要知道自己跑在浏览器标签里还是独立主屏窗口里。
 */

/** 注册 Service Worker。只在生产构建里注册，开发时留着会干扰 Vite 热更新。 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 注册失败不影响主流程：应用照常以普通网页运行 */
    })
  })
}

/** 是否已经从主屏图标启动（即"像 App 一样"运行中） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const modes = ['standalone', 'fullscreen', 'minimal-ui']
  if (modes.some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)) return true
  // iOS Safari 的老写法，display-mode 媒体查询在部分版本上不可靠
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ 的 Safari 默认伪装成 macOS，靠触摸点数补判
  const iPadOS = /Macintosh/i.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/i.test(ua) || iPadOS
}

/** 是否 Safari（含 iOS 上所有浏览器，因为都是 WebKit 内核） */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua)
}

/**
 * 浏览器是否支持安装到主屏。
 * 保守判断：Android 系 Chromium 浏览器和 iOS Safari 都支持，
 * 但 App 内置浏览器（微信/QQ/钉钉）一律不支持，必须先"用浏览器打开"。
 */
export function canInstallToHomeScreen(): boolean {
  if (isStandalone()) return false
  return isIOS() || /Android/i.test(navigator.userAgent)
}

const DISMISS_KEY = 'pwa-install-hint-dismissed'

export function isInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 */
  }
}
