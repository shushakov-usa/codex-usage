import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Timer, Check } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../lib/hooks'

const INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
] as const

export function RefreshPicker() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const current = settings?.refreshInterval ?? 300
  const currentLabel = INTERVALS.find(i => i.value === current)?.label ?? `${current}s`

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover text-sm text-text-muted transition-colors">
          <Timer className="w-3.5 h-3.5" />
          <span>{currentLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-surface-hover rounded-lg p-1 min-w-[120px] shadow-xl shadow-black/40 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          sideOffset={4}
          align="end"
        >
          {INTERVALS.map(({ label, value }) => (
            <DropdownMenu.Item
              key={value}
              onSelect={() => updateSettings.mutate({ refreshInterval: value })}
              className="flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-white/[0.06] focus:bg-white/[0.06]"
            >
              <span>{label}</span>
              {current === value && <Check className="w-3.5 h-3.5 text-accent" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
