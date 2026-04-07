import { Plus } from 'lucide-react'
import { useCreateSlot } from '../lib/hooks'

export function AddCard() {
  const createSlot = useCreateSlot()

  return (
    <button
      onClick={() => createSlot.mutate()}
      disabled={createSlot.isPending}
      className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[200px] hover:border-text-muted hover:bg-surface/50 transition-colors cursor-pointer disabled:opacity-50"
    >
      <Plus className="w-8 h-8 text-text-muted" />
      <span className="text-sm text-text-muted font-medium">Add Account</span>
    </button>
  )
}
