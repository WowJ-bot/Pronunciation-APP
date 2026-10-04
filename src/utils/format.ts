export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** 距离截止还有多久，用于看板上的紧迫感提示 */
export function formatDueLabel(dueAt?: string | null, isOverdue?: boolean) {
  if (!dueAt) return { text: '无截止时间', tone: 'normal' as const }
  const diff = new Date(dueAt).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)

  if (isOverdue || diff < 0) return { text: `已逾期 ${Math.abs(days)} 天`, tone: 'danger' as const }
  if (days <= 1) return { text: '今天截止', tone: 'warning' as const }
  return { text: `还有 ${days} 天`, tone: 'normal' as const }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
