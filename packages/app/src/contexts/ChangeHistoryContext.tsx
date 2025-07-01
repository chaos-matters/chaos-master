import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const ChangeHistoryContext = createContext<ChangeHistory<FlameDescriptor>>()

export const ChangeHistoryContextProvider = ChangeHistoryContext.Provider

export function useChangeHistory() {
  return useContextSafe(
    ChangeHistoryContext,
    'useChangeHistory',
    'ChangeHistoryContext',
  )
}
