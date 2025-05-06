import { createContext } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { Signal } from 'solid-js'

const GlassyLookContext = createContext<Signal<boolean>>()

export const GlassyLookContextProvider = GlassyLookContext.Provider

export function useGlassyLookFlag() {
  const [glassyLook, setGlassyLook] = useContextSafe(
    GlassyLookContext,
    'useGlassyLookFlag',
    'GlassyLookContext',
  )
  return { glassyLook, setGlassyLook }
}
