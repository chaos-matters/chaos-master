import { createContext, createEffect, createSignal, onCleanup, useContext, } from 'solid-js'
import type { Accessor, ParentProps } from 'solid-js'

/** Breakpoint below which the app switches to mobile layout. */
const MOBILE_BREAKPOINT = 769

interface MobileContextType {
  /** True when the viewport is narrower than MOBILE_BREAKPOINT. */
  isMobile: Accessor<boolean>
}

const MobileContext = createContext<MobileContextType>({
  isMobile: () => false,
})

/**
 * Provides a reactive `isMobile` signal that tracks the viewport width
 * against MOBILE_BREAKPOINT. Wrap the app root with this provider so any
 * component can call `useMobile()` to conditionally adjust for small screens.
 */
export function MobileProvider(props: ParentProps) {
  const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  const [isMobile, setIsMobile] = createSignal(mq.matches)

  createEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    onCleanup(() => {
      mq.removeEventListener('change', handler)
    })
  })

  return (
    <MobileContext.Provider value={{ isMobile }}>
      {props.children}
    </MobileContext.Provider>
  )
}

/**
 * Returns `{ isMobile }` -- a reactive signal that is true on small screens.
 * Use this anywhere you need mobile-specific behavior or layout changes.
 */
export function useMobile() {
  return useContext(MobileContext)
}
