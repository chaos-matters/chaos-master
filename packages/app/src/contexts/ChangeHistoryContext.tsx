import { createContext, useContext } from 'solid-js'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const ChangeHistoryContext = createContext<ChangeHistory<FlameDescriptor>>()

export const ChangeHistoryContextProvider = ChangeHistoryContext.Provider

const noopHistory: ChangeHistory<FlameDescriptor> = {
  replace: () => {},
  undo: () => {},
  redo: () => {},
  hasUndo: () => false,
  hasRedo: () => false,
  startPreview: () => {},
  isPreviewing: () => false,
  isUndoingOrRedoing: () => false,
  commit: () => {},
}

export function useChangeHistory() {
  return useContext(ChangeHistoryContext) ?? noopHistory
}
