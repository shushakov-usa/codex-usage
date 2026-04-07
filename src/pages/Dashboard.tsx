import { useAccounts } from '../lib/hooks'
import { TopBar } from '../components/TopBar'
import { AccountCard } from '../components/AccountCard'
import { EmptyCard } from '../components/EmptyCard'
import { AddCard } from '../components/AddCard'

export function Dashboard() {
  const { data, isLoading } = useAccounts()
  const accounts = data?.accounts ?? []

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-6 max-sm:px-4">
      <TopBar />
      {isLoading ? (
        <div className="text-text-muted text-center py-12">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account =>
            account.connected
              ? <AccountCard key={account.slot} account={account} />
              : <EmptyCard key={account.slot} account={account} />
          )}
          <AddCard />
        </div>
      )}
    </main>
  )
}
