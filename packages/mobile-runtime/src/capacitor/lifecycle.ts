/**
 * The Capacitor binding of the lifecycle ports. Only the native build reaches
 * this module, through the guarded dynamic import in the app's lib/lifecycle.
 */
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import type { LifecyclePorts } from '../lifecycle'

/**
 * `addListener` answers with the handle a tick later, and a caller may stop
 * listening before that: remember the intent and remove on arrival.
 */
function subscribe(pending: Promise<PluginListenerHandle>): () => void {
  let disposed = false
  let handle: PluginListenerHandle | undefined
  void pending.then(
    (resolved) => {
      handle = resolved
      if (disposed) void handle.remove()
    },
    (error: unknown) => {
      console.warn('[lifecycle] listener not registered:', error)
    },
  )
  return () => {
    disposed = true
    if (handle) void handle.remove()
  }
}

export const capacitorLifecycle: LifecyclePorts = {
  // Registering a backButton listener is also what stops Capacitor's default
  // handling, which is history.back() or exiting the app.
  onBackButton: (callback) =>
    subscribe(
      App.addListener('backButton', () => {
        callback()
      }),
    ),
  onPause: (callback) =>
    subscribe(
      App.addListener('pause', () => {
        callback()
      }),
    ),
  onResume: (callback) =>
    subscribe(
      App.addListener('resume', () => {
        callback()
      }),
    ),
  minimizeApp: () => App.minimizeApp(),
}
