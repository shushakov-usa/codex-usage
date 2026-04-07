import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from './api'
import type { AccountsResponse, Settings, HistoryResponse } from '../types/api'

export function useAccounts() {
  return useQuery<AccountsResponse>({
    queryKey: ['accounts'],
    queryFn: api.fetchAccounts,
    refetchInterval: 5000,
  })
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: api.fetchSettings,
  })
}

export function useHistory(range: '24h' | '7d' | '30d') {
  return useQuery<HistoryResponse>({
    queryKey: ['history', range],
    queryFn: () => api.fetchHistory(range),
  })
}

export function useRefreshAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.refreshAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useRefreshSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slot: string) => api.refreshSlot(slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useCreateSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createSlot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useLoginSlot() {
  return useMutation({
    mutationFn: (slot: string) => api.loginSlot(slot),
  })
}

export function useLogoutSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slot: string) => api.logoutSlot(slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useDeleteSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slot: string) => api.deleteSlot(slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useExchangeCallback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slot, url }: { slot: string; url: string }) =>
      api.exchangeCallback(slot, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
