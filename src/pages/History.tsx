import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useHistory, useAccounts } from '../lib/hooks'
import { navigate } from '../lib/router'

type Range = '24h' | '7d' | '30d'

export function History() {
  const [range, setRange] = useState<Range>('24h')
  const { data: historyData, isLoading } = useHistory(range)
  const { data: accountsData } = useAccounts()

  const accounts = accountsData?.accounts ?? []
  const snapshots = historyData?.snapshots ?? []

  const accountChartData = accounts
    .filter(a => a.connected)
    .map(account => {
      const points = snapshots
        .filter(s => s.accounts[account.slot])
        .map(s => {
          const acct = s.accounts[account.slot]
          const w5h = acct.windows.find(w => w.label?.includes('h'))
          const wWeek = acct.windows.find(w =>
            w.label?.toLowerCase().includes('week') ||
            w.label?.toLowerCase().includes('day')
          )
          return {
            time: s.timestamp,
            '5h': w5h ? Math.max(0, 100 - w5h.usedPercent) : null,
            Weekly: wWeek ? Math.max(0, 100 - wWeek.usedPercent) : null,
          }
        })
      return { email: account.email ?? account.slot, points }
    })

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    if (range === '24h') {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-6 max-sm:px-4">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-text-muted" />
          </button>
          <h1 className="text-xl font-semibold">Usage History</h1>
        </div>
        <div className="flex gap-1 bg-surface rounded-lg p-1">
          {(['24h', '7d', '30d'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                range === r
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="text-text-muted text-center py-12">Loading…</div>
      ) : accountChartData.length === 0 ? (
        <div className="text-text-muted text-center py-12">No history data yet</div>
      ) : (
        <div className="space-y-6">
          {accountChartData.map(({ email, points }) => (
            <section key={email} className="bg-surface rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-4">{email}</h2>
              {points.length === 0 ? (
                <div className="text-text-muted text-sm py-4">
                  No data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={formatTime}
                      stroke="#6b7a8d"
                      fontSize={11}
                    />
                    <YAxis
                      domain={[0, 100]}
                      stroke="#6b7a8d"
                      fontSize={11}
                      tickFormatter={v => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1a2130',
                        border: '1px solid #1e2a3a',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(label) => formatTime(label as number)}
                      formatter={(value) => [`${Number(value).toFixed(0)}%`]}
                    />
                    <Line
                      type="monotone"
                      dataKey="5h"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="Weekly"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
