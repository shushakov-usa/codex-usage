import { RefreshCw } from 'lucide-react'
import type { Account } from '../types/api'
import { QuotaBlock } from './QuotaBlock'
import { KebabMenu } from './KebabMenu'
import { formatRelativeTime } from '../lib/utils'
import { useRefreshSlot } from '../lib/hooks'
import { toast } from 'sonner'

export function AccountCard({ account }: { account: Account }) {
  const refreshSlot = useRefreshSlot()
  const windows = account.usage?.windows ?? []
  const w5h = windows.find(w => w.label?.includes('h'))
  const wWeek = windows.find(w =>
    w.label?.toLowerCase().includes('week') || w.label?.toLowerCase().includes('day')
  )
  const plan = account.usage?.plan ?? account.planTypeFromJwt

  const handleRefresh = async () => {
    try {
      await refreshSlot.mutateAsync(account.slot)
    } catch (err) {
      toast.error(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <article className="bg-surface rounded-xl p-4 hover:bg-surface-hover transition-colors duration-150">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold truncate">
            {account.email ?? 'Unknown'}
          </h2>
          {plan && (
            <span className="text-[11px] uppercase tracking-wide text-text-muted">
              {plan}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-2 h-2 rounded-full bg-good" />
          <KebabMenu account={account} />
        </div>
      </div>

      <div className="space-y-2.5 mb-3">
        {w5h && <QuotaBlock window={w5h} label="5h Quota" />}
        {wWeek && <QuotaBlock window={wWeek} label="Weekly Quota" />}
        {!windows.length && (
          <div className="text-sm text-text-muted py-2">No usage data yet</div>
        )}
      </div>

      {account.lastError && (
        <div className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2 mb-3 break-words">
          {account.lastError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 text-xs text-text-muted">
        <span>{formatRelativeTime(account.lastCheckedAt)}</span>
        <button
          onClick={handleRefresh}
          disabled={refreshSlot.isPending}
          className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshSlot.isPending ? 'animate-spin' : ''}`}
          />
        </button>
      </div>
    </article>
  )
}
