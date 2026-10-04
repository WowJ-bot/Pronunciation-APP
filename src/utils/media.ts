/**
 * 录制相关的设备与浏览器探测。
 *
 * 手机上「录不了音」十有八九不是代码问题，而是以下三种环境限制之一。
 * 提前探测出来并给出准确指引，比让用户对着「无法启动录制设备」发呆有用得多。
 */

/**
 * 微信 / 企业微信内置浏览器。两者的 UA 都含 MicroMessenger，
 * 且都对 getUserMedia 支持不佳（iOS 上摄像头基本不可用），一并拦下。
 */
export function isWechatBrowser(): boolean {
  return /micromessenger/i.test(navigator.userAgent)
}

export function isMobile(): boolean {
  return /android|iphone|ipad|ipod|harmony/i.test(navigator.userAgent)
}

/** getUserMedia 只在安全上下文可用：https 或 localhost */
export function isMediaSecure(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export type MediaBlocker = 'wechat' | 'insecure' | 'unsupported' | null

export function detectMediaBlocker(): MediaBlocker {
  if (typeof navigator === 'undefined') return 'unsupported'
  // 微信内置浏览器放在最前面：这是学生最常见的入口，且症状最容易被误解
  if (isWechatBrowser()) return 'wechat'
  if (!isMediaSecure()) return 'insecure'
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  if (typeof MediaRecorder === 'undefined') return 'unsupported'
  return null
}

export const MEDIA_BLOCKER_TEXT: Record<Exclude<MediaBlocker, null>, string> = {
  wechat: '微信内置浏览器无法调用录音和摄像头。请点右上角「···」→「在浏览器打开」，用手机自带的浏览器（Safari / Chrome）重新进入。',
  insecure: '浏览器只允许 https 页面调用录音和摄像头。当前是 http 访问，请让老师发正式的 https 链接给你。',
  unsupported: '当前浏览器不支持网页录音，请更新到最新版 Chrome 或 Safari，或改用电脑提交。',
}

/** 把 getUserMedia 抛出的异常翻译成能对症下药的提示 */
export function describeGetUserMediaError(e: unknown, kind: 'audio' | 'video'): string {
  if (e instanceof DOMException) {
    switch (e.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '你拒绝了麦克风/摄像头权限。请在浏览器地址栏左侧的锁形图标里改成「允许」，然后重新点击录制。'
      case 'NotFoundError':
        return kind === 'video'
          ? '这台设备没有检测到摄像头，改录音频即可。'
          : '这台设备没有检测到麦克风。'
      case 'NotReadableError':
        return '麦克风/摄像头被其他程序占用了（比如正在通话、或另一个页面在录音），关掉它再试。'
      case 'OverconstrainedError':
        return '摄像头不满足要求，请切换前后摄像头或改用音频录制。'
      default:
        return `无法启动录制（${e.name}）。`
    }
  }
  return '无法启动录制设备，请刷新页面后重试。'
}

/** 从 blob 的 mime 推断文件扩展名，避免 iOS 录的 mp4 被存成 .webm */
export function extensionForMime(mime: string, kind: 'audio' | 'video'): string {
  const m = (mime || '').toLowerCase()
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('webm')) return 'webm'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  return kind === 'video' ? 'webm' : 'webm'
}
