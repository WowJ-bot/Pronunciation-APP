import { useEffect, useState } from 'react'
import {
  canInstallToHomeScreen,
  dismissInstallHint,
  isInstallHintDismissed,
  isIOS,
  isStandalone,
} from '@/utils/pwa'
import { isWechatBrowser } from '@/utils/media'

/**
 * 「添加到主屏幕」引导条。
 *
 * 存在的理由：这个平台最主要的入口是老师把链接丢进微信群、学生直接点开。
 * 而**微信内置浏览器既装不了 PWA，也调不起麦克风和摄像头**——
 * 不提示的话，学生只会以为"网站坏了"。
 */
export function InstallHint() {
  const [visible, setVisible] = useState(false)
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null)
  const [wechat, setWechat] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (isStandalone() || isInstallHintDismissed()) return

    const inWechat = isWechatBrowser()
    const onIOS = isIOS()

    if (inWechat || canInstallToHomeScreen()) {
      setWechat(inWechat)
      setIos(onIOS)
      setVisible(true)
    }

    // 安卓 Chromium 系浏览器会抛出这个事件，可以一键安装
    const onPrompt = (event: Event) => {
      event.preventDefault()
      const e = event as Event & { prompt: () => Promise<void> }
      setDeferred({ prompt: () => e.prompt() })
    }
    const onInstalled = () => setVisible(false)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible) return null

  const close = () => {
    dismissInstallHint()
    setVisible(false)
  }

  let title: string
  let steps: string
  if (wechat) {
    title = '在浏览器中打开，体验更完整'
    steps = '点右上角「···」→「在浏览器打开」。微信内置浏览器无法使用录音和摄像头。'
  } else if (ios) {
    title = '安装到主屏幕，像 App 一样用'
    steps = '点底部「分享」→「添加到主屏幕」。之后从图标打开即为全屏，无地址栏。'
  } else {
    title = '安装到主屏幕'
    steps = '打开浏览器菜单 →「添加到主屏幕」或「安装应用」。'
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl bg-slate-900/95 px-4 py-3 text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{steps}</p>
        </div>

        {deferred && (
          <button
            type="button"
            onClick={() => {
              void deferred.prompt()
              close()
            }}
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
          >
            立即安装
          </button>
        )}

        <button
          type="button"
          onClick={close}
          aria-label="不再提示"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
