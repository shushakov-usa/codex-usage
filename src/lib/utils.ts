export type QuotaStatus = 'good' | 'warn' | 'bad'

export function getQuotaStatus(usedPercent: number): QuotaStatus {
  if (usedPercent > 80) return 'bad'
  if (usedPercent >= 50) return 'warn'
  return 'good'
}

export function getRemainingPercent(usedPercent: number): number {
  return Math.max(0, 100 - usedPercent)
}

export function formatTimeLeft(resetAt: number | null): string {
  if (!resetAt) return ''
  const diff = resetAt - Date.now()
  if (diff <= 0) return 'now'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 0) return 'just now'
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function formatResetTime(ts: number | null): string {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Today, ${timeStr}`
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${timeStr}`
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dateStr}, ${timeStr}`
}

export const STATUS_COLORS = {
  good: { text: 'text-good', bg: 'bg-good' },
  warn: { text: 'text-warn', bg: 'bg-warn' },
  bad: { text: 'text-bad', bg: 'bg-bad' },
} as const
