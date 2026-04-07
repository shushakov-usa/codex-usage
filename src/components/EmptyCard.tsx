import { useState } from 'react'
import { LogIn } from 'lucide-react'
import type { Account } from '../types/api'
import { KebabMenu } from './KebabMenu'
import { useLoginSlot, useExchangeCallback } from '../lib/hooks'
import { toast } from 'sonner'

export function EmptyCard({ account }: { account: Account }) {
  const loginSlot = useLoginSlot()
  const exchangeCallback = useExchangeCallback()
  const [callbackUrl, setCallbackUrl] = useState('')

  const handleLogin = async () => {
    try {
      const data = await loginSlot.mutateAsync(account.slot)
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      toast.error(`Login failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExchange = async () => {
    if (!callbackUrl.trim()) return
    try {
      await exchangeCallback.mutateAsync({ slot: account.slot, url: callbackUrl.trim() })
      setCallbackUrl('')
      toast.success('Account connected')
    } catch (err) {
      toast.error(`Exchange failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <article className="bg-surface rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="text-[15px] font-semibold text-text-muted">Empty slot</h2>
        <KebabMenu account={account} />
      </div>

      <div className="flex flex-col items-center gap-3 py-4">
        <button
          onClick={handleLogin}
          disabled={loginSlot.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          Login
        </button>
      </div>

      <div className="p-3 bg-[#0d1117] rounded-lg">
        <p className="text-xs text-text-muted mb-2">
          After authorization, paste the callback URL:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={callbackUrl}
            onChange={e => setCallbackUrl(e.target.value)}
            placeholder="http://localhost:1455/auth/callback?code=…"
            className="flex-1 bg-bg text-text border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
            onKeyDown={e => e.key === 'Enter' && handleExchange()}
          />
          <button
            onClick={handleExchange}
            disabled={exchangeCallback.isPending}
            className="px-3 py-1.5 bg-surface-hover text-text rounded-md text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {exchangeCallback.isPending ? '⏳' : 'OK'}
          </button>
        </div>
      </div>
    </article>
  )
}
