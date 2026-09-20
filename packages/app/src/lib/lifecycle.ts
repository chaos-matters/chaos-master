import { webLifecycle } from '@chaos-master/mobile-runtime/lifecycle'
import { popBack } from './backStack'
import type { LifecyclePorts } from '@chaos-master/mobile-runtime/lifecycle'

/**
 * The app's one view of the platform's lifecycle. On the web the ports come
 * from `visibilitychange`, so a hidden tab pauses like a backgrounded app.
 * In the native build the Capacitor ports arrive through a dynamic import
 * that web builds drop (the same pattern as lib/haptics.ts).
 *
 * Back is the reason this module owns a subscription rather than exposing
 * one: the gesture belongs to the registry (lib/backStack.ts), and only an
 * empty registry sends the app to the background. Nothing here ever calls
 * history.back().
 *
 * Pause is the only side the app subscribes to. `LifecyclePorts` still
 * carries resume, because the platforms report it and the seam should
 * describe them honestly, but nothing here re-exposes it: an `appActive`
 * signal and an `onAppResume` shipped with no reader, and a signal nothing
 * reads is a claim rather than a feature.
 */

// Vite's `define` turns this into a literal in each module. The import is
// guarded by it rather than by the imported IS_NATIVE: the bundler does not
// fold constants across modules (lib/platform.ts).
declare const __NATIVE_BUILD__: boolean

const pauseCallbacks = new Set<() => void>()

/** Runs `callback` when the app goes to the background. Returns a disposer. */
export function onAppPause(callback: () => void): () => void {
  pauseCallbacks.add(callback)
  return () => pauseCallbacks.delete(callback)
}

const run = (callbacks: ReadonlySet<() => void>) => {
  for (const callback of [...callbacks]) callback()
}

let ports: LifecyclePorts = webLifecycle()
let unsubscribe: (() => void)[] = []

function bind(next: LifecyclePorts) {
  for (const stop of unsubscribe) stop()
  ports = next
  unsubscribe = [
    ports.onBackButton(() => {
      if (popBack()) return
      // iOS has no minimize; the plugin rejects there rather than resolving,
      // and a rejection nobody catches is a console error on every back.
      ports.minimizeApp().catch((error: unknown) => {
        console.warn('[lifecycle] minimizeApp unavailable:', error)
      })
    }),
    ports.onPause(() => {
      run(pauseCallbacks)
    }),
  ]
}

bind(ports)

/** Swaps the platform behind the facade. For the native load and for tests. */
export function useLifecyclePorts(next: LifecyclePorts): void {
  bind(next)
}

let loading: Promise<void> | null = null

/** Binds the native ports once. Safe to call any number of times. */
export function loadLifecycle(): Promise<void> {
  if (!__NATIVE_BUILD__) return Promise.resolve()
  loading ??= import('@chaos-master/mobile-runtime/capacitor-lifecycle').then(
    (runtime) => {
      useLifecyclePorts(runtime.capacitorLifecycle)
    },
    (error: unknown) => {
      console.warn('[lifecycle] native ports unavailable:', error)
    },
  )
  return loading
}
