import { createContext, useContext } from 'solid-js'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const ChangeHistoryContext = createContext<ChangeHistory<FlameDescriptor>>()

export const ChangeHistoryContextProvider = ChangeHistoryContext.Provider

// Deliberate graceful degradation: Flam3 and the zoom cameras read undo/redo
// history but are also rendered in many provider-less preview/export sites
// (BenchmarkModal, ExportJobs, LoadFlameModal, LogoFaviconGenerator,
// WelcomeScreen, thumbnails, ...). Outside a provider, history operations are
// no-ops rather than a crash. Genuinely-required contexts throw via
// useContextSafe instead.
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
  peekUndoSeq: () => null,
  peekRedoSeq: () => null,
}

export function useChangeHistory() {
  return useContext(ChangeHistoryContext) ?? noopHistory
}
