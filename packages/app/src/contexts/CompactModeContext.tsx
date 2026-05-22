import { createContext, createSignal, useContext } from 'solid-js'
import type { Accessor, ParentProps } from 'solid-js'

interface CompactModeContextType {
  isCompact: Accessor<boolean>
  toggleCompact: () => void
}

export const CompactModeContext = createContext<CompactModeContextType | null>(
  null,
)

export function CompactModeProvider(props: ParentProps) {
  const [isCompact, setIsCompact] = createSignal(false)

  return (
    <CompactModeContext.Provider
      value={{
        isCompact,
        toggleCompact: () => setIsCompact((v) => !v),
      }}
    >
      {props.children}
    </CompactModeContext.Provider>
  )
}

export function useCompactMode() {
  const context = useContext(CompactModeContext)
  if (!context) {
    return { isCompact: () => false, toggleCompact: () => {} }
  }
  return context
}
