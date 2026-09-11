import { hapticsWith, NO_HAPTICS } from '@chaos-master/mobile-runtime/haptics'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Haptics } from '@chaos-master/mobile-runtime/haptics'

/**
 * The app's one entry point for haptics. On the web every call is a no-op.
 * In the native build the Capacitor ports arrive through a dynamic import
 * that web builds drop (the same pattern as lib/nativeSave.ts), so the
 * plugin chunk never ships to the web.
 */

/** The Haptics switch in Settings. Native only; the web never reads it. */
export const [hapticsEnabled, setHapticsEnabled] = persistentSignal<boolean>(
  'chaos-haptics',
  true,
)

// Vite's `define` turns this into a literal in each module. The import is
// guarded by it rather than by the imported IS_NATIVE: the bundler does not
// fold constants across modules (lib/platform.ts).
declare const __NATIVE_BUILD__: boolean

let current: Haptics = NO_HAPTICS
let loading: Promise<void> | null = null

/** Binds the native ports once. Safe to call any number of times. */
export function loadHaptics(): Promise<void> {
  if (!__NATIVE_BUILD__) return Promise.resolve()
  loading ??= import('@chaos-master/mobile-runtime/capacitor-haptics').then(
    (runtime) => {
      current = hapticsWith(runtime.hapticPorts, hapticsEnabled)
    },
    (error: unknown) => {
      console.error('Haptics unavailable:', error)
    },
  )
  return loading
}

/** Delegates per call, so a binding that arrives later is picked up. */
export const haptic: Haptics = {
  impactLight: () => {
    current.impactLight()
  },
  impactMedium: () => {
    current.impactMedium()
  },
  success: () => {
    current.success()
  },
  warning: () => {
    current.warning()
  },
  error: () => {
    current.error()
  },
  selectionStart: () => {
    current.selectionStart()
  },
  selectionChanged: () => {
    current.selectionChanged()
  },
  selectionEnd: () => {
    current.selectionEnd()
  },
}
