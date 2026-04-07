export interface QuotaWindow {
  label: string
  usedPercent: number
  resetAt: number | null
}

export interface UsageData {
  plan: string | null
  windows: QuotaWindow[]
}

export interface Entitlement {
  active: boolean
  plan: string | null
  activeUntil: string | null
}

export interface Account {
  slot: string
  connected: boolean
  email: string | null
  accountId: string | null
  planTypeFromJwt: string | null
  usage: UsageData | null
  expires: number | null
  updatedAt: number | null
  lastCheckedAt: number | null
  lastError: string | null
  entitlement: Entitlement | null
}

export interface AccountsResponse {
  accounts: Account[]
}

export interface Settings {
  refreshInterval: number
}

export interface HistorySnapshot {
  timestamp: number
  accounts: Record<string, {
    email: string | null
    windows: { label: string; usedPercent: number }[]
  }>
}

export interface HistoryResponse {
  snapshots: HistorySnapshot[]
}
