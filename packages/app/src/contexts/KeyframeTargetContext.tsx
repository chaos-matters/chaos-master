import { createContext, createSignal, useContext } from 'solid-js'
import type { Accessor, ParentProps } from 'solid-js'

type KeyframeParameterPath = string

interface KeyframeTargetContextType {
  targetedParameter: Accessor<KeyframeParameterPath | null>
  setTargetedParameter: (path: KeyframeParameterPath | null) => void
  selectedKeyframePath: Accessor<KeyframeParameterPath | null>
  setSelectedKeyframePath: (path: KeyframeParameterPath | null) => void
}

export const KeyframeTargetContext =
  createContext<KeyframeTargetContextType | null>(null)

export function KeyframeTargetProvider(props: ParentProps) {
  const [targetedParameter, setTargetedParameter] =
    createSignal<KeyframeParameterPath | null>(null)
  const [selectedKeyframePath, setSelectedKeyframePath] =
    createSignal<KeyframeParameterPath | null>(null)

  return (
    <KeyframeTargetContext.Provider
      value={{
        targetedParameter,
        setTargetedParameter,
        selectedKeyframePath,
        setSelectedKeyframePath,
      }}
    >
      {props.children}
    </KeyframeTargetContext.Provider>
  )
}

export function useKeyframeTarget() {
  const context = useContext(KeyframeTargetContext)
  if (!context) {
    const nilAccessor = () => null as string | null
    const noop = () => {}
    return {
      targetedParameter: nilAccessor,
      setTargetedParameter: noop,
      selectedKeyframePath: nilAccessor,
      setSelectedKeyframePath: noop,
    }
  }
  return context
}
