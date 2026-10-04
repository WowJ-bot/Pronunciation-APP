/**
 * Supabase 的邮件链接（注册确认 / 重设密码）失效时，会把错误带回前端：
 *
 *   http://localhost:5173/#error=access_denied
 *                       &error_code=otp_expired
 *                       &error_description=Email+link+is+invalid+or+has+expired
 *                       &sb=...
 *
 * 这里在应用启动的最早期读一次，转成中文暂存，并把 hash 从地址栏抹掉
 * （否则刷新页面会反复提示）。
 *
 * 为什么不放在 LoginPage 里读：未登录访问 `/` 会被路由守卫的
 * <Navigate> 重定向到 /login，那一步会把 hash 丢掉。
 */

let pending: string | null = null

const MESSAGES: Record<string, string> = {
  otp_expired: '邮件里的确认链接已失效或已被使用过（邮件客户端提前访问链接也会让它失效）。',
  access_denied: '这个链接无法使用。',
  otp_disabled: '该方式已停用，请改用邮箱密码登录。',
}

export function captureAuthRedirectError(): void {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.includes('error')) return

  const params = new URLSearchParams(hash)
  const code = params.get('error_code') ?? ''
  const description = params.get('error_description') ?? ''

  pending =
    MESSAGES[code] ??
    (/invalid or has expired/i.test(description)
      ? MESSAGES.otp_expired
      : '邮件里的链接无法使用，请重新登录。')

  // 抹掉 hash，避免刷新时重复提示
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/** 读取暂存的提示。刻意不做「取走即清空」，以兼容 StrictMode 下的重复渲染 */
export function getAuthRedirectError(): string | null {
  return pending
}
