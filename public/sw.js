/**
 * 发音纠音平台 Service Worker
 *
 * 目标：让「添加到主屏幕」后的应用有独立图标和离线外壳，弱网下也能快速打开。
 *
 * 一条硬规则：**只缓存同源静态资源，绝不缓存跨域请求**。
 * Supabase 的 API 和 Storage 签名链接必须实时，缓存住会让学生看到过期的作业状态。
 */

const VERSION = 'v1'
const SHELL_CACHE = `shell-${VERSION}`
const ASSET_CACHE = `asset-${VERSION}`

// 应用外壳：安装在后台完成，保证断网时仍能打开一个可用的空壳
const SHELL_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 逐个 add 并吞掉失败：任何一个资源 404 都不应该让整个安装失败
      await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => null)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // 跨域（Supabase API / Storage）直接交给网络，不缓存
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先，断网时回退到缓存的壳
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE)
            cache.put('/index.html', fresh.clone())
          }
          return fresh
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
        }
      })(),
    )
    return
  }

  // 静态资源：缓存优先，命中后后台静默更新
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE)
      const cached = await cache.match(request)
      if (cached) {
        fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone())
          })
          .catch(() => {})
        return cached
      }
      try {
        const res = await fetch(request)
        if (res && res.ok && res.type === 'basic') cache.put(request, res.clone())
        return res
      } catch {
        return Response.error()
      }
    })(),
  )
})
