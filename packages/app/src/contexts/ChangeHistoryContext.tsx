import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { FlameFunction } from '@/flame/flameFunction'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const ChangeHistoryContext = createContext<ChangeHistory<FlameFunction[]>>()

export const ChangeHistoryContextProvider = ChangeHistoryContext.Provider

export function useChangeHistory() {
  return useContextSafe(
    ChangeHistoryContext,
    'useChangeHistory',
    'ChangeHistoryContext',
  )
}
