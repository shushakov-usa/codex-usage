import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Timer, Check } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../lib/hooks'

const LIVE_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
] as const

const BG_INTERVALS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '30m', value: 1800 },
] as const

export function RefreshPicker() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const live = settings?.liveInterval ?? 30
  const bg = settings?.backgroundInterval ?? 300
  const liveLabel = LIVE_INTERVALS.find(i => i.value === live)?.label ?? `${live}s`

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover text-sm text-text-muted transition-colors">
          <Timer className="w-3.5 h-3.5" />
          <span>{liveLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-surface-hover rounded-lg p-1 min-w-[160px] shadow-xl shadow-black/40 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-medium text-text-muted/60 uppercase tracking-wider">
            Live refresh
          </DropdownMenu.Label>
          {LIVE_INTERVALS.map(({ label, value }) => (
            <DropdownMenu.Item
              key={`live-${value}`}
              onSelect={() => updateSettings.mutate({ liveInterval: value })}
              className="flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-white/[0.06] focus:bg-white/[0.06]"
            >
              <span>{label}</span>
              {live === value && <Check className="w-3.5 h-3.5 text-accent" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="h-px bg-white/[0.06] my-1" />
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-medium text-text-muted/60 uppercase tracking-wider">
            Background
          </DropdownMenu.Label>
          {BG_INTERVALS.map(({ label, value }) => (
            <DropdownMenu.Item
              key={`bg-${value}`}
              onSelect={() => updateSettings.mutate({ backgroundInterval: value })}
              className="flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-white/[0.06] focus:bg-white/[0.06]"
            >
              <span>{label}</span>
              {bg === value && <Check className="w-3.5 h-3.5 text-accent" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
