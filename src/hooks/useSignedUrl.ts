import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * 私有 bucket 的文件不能用公开链接访问，
 * 这里按需换取临时签名 URL 并做缓存。
 */
export function useSignedUrl(bucket: string | null, path: string | null | undefined, expiresIn = 3600) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bucket || !path) {
      setUrl(null)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
    setUrl(error ? null : data.signedUrl)
    setLoading(false)
  }, [bucket, path, expiresIn])

  useEffect(() => {
    void load()
  }, [load])

  return { url, loading }
}

/** 批量换取签名 URL，用于文章图片组 */
export function useSignedUrls(bucket: string | null, paths: string[]) {
  const [urls, setUrls] = useState<string[]>([])
  const key = paths.join('|')

  useEffect(() => {
    let active = true
    void (async () => {
      if (!bucket || !paths.length) {
        setUrls([])
        return
      }
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600)
      if (!active) return
      setUrls((data ?? []).map((d) => d.signedUrl ?? ''))
    })()
    return () => {
      active = false
    }
  }, [bucket, key]) // eslint-disable-line react-hooks/exhaustive-deps

  return urls
}
