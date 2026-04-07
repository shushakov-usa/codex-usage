import { RefreshCw, BarChart3 } from 'lucide-react'
import { RefreshPicker } from './RefreshPicker'
import { useRefreshAll } from '../lib/hooks'
import { navigate } from '../lib/router'
import { toast } from 'sonner'

export function TopBar() {
  const refreshAll = useRefreshAll()

  const handleRefreshAll = async () => {
    try {
      const data = await refreshAll.mutateAsync()
      const results = data.results ?? []
      const ok = results.filter(r => r.ok).length
      const fail = results.filter(r => !r.ok).length
      if (fail > 0) {
        toast.error(`Refreshed: ${ok} ok, ${fail} failed`)
      } else {
        toast.success(`${ok} account${ok !== 1 ? 's' : ''} refreshed`)
      }
    } catch {
      toast.error('Refresh failed')
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 mb-6">
      <h1 className="text-xl font-semibold">Codex Usage</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/history')}
          className="p-2 rounded-lg hover:bg-surface transition-colors"
          title="Usage history"
        >
          <BarChart3 className="w-4 h-4 text-text-muted" />
        </button>
        <RefreshPicker />
        <button
          onClick={handleRefreshAll}
          disabled={refreshAll.isPending}
          className="p-2 rounded-lg bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
          title="Refresh all"
        >
          <RefreshCw
            className={`w-4 h-4 text-text-muted ${refreshAll.isPending ? 'animate-spin' : ''}`}
          />
        </button>
      </div>
    </header>
  )
}
