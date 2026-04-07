import { useEffect, useState } from 'react'
import type { QuotaWindow } from '../types/api'
import { getQuotaStatus, getRemainingPercent, formatTimeLeft, formatResetTime, STATUS_COLORS } from '../lib/utils'

export function QuotaBlock({ window: w, label }: { window: QuotaWindow; label: string }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const remaining = getRemainingPercent(w.usedPercent)
  const status = getQuotaStatus(w.usedPercent)
  const colors = STATUS_COLORS[status]

  return (
    <div className="rounded-lg bg-[#0d1117] p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-text-muted font-medium">{label}</span>
        <span className={`text-2xl font-bold tabular-nums ${colors.text}`}>
          {remaining.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${colors.bg} transition-[width] duration-300 ease-out`}
          style={{ width: `${remaining}%` }}
        />
      </div>
      <div className="text-xs">
        <div className="text-text">Resets in {formatTimeLeft(w.resetAt)}</div>
        <div className="text-text-muted text-[11px] mt-0.5">{formatResetTime(w.resetAt)}</div>
      </div>
    </div>
  )
}
