/**
 * The one way the app starts a view transition, so renderers can tell when one
 * has ended.
 *
 * Apple WebKit gets no transition: the update runs at once. While a
 * same-document view transition runs there, WebKit snapshots the page on every
 * frame, and each snapshot presents a WebGPU canvas's swap chain without
 * choosing what the canvas displays (GPUCanvasContextCocoa::
 * surfaceBufferToImageBuffer, Safari 26 and iOS 26). The canvas flickers
 * through old buffers for the whole fade, and a renderer that stopped drawing
 * before the fade ended was left showing one of them, such as the flame that
 * was loaded before. What counts as Apple WebKit is utils/platform's
 * isAppleWebKit: iOS and iPadOS, every browser there, the iOS app's
 * WKWebView, and macOS Safari.
 *
 * Other engines keep the fade. Renderers watch `viewTransitionsSettled` and
 * present their current image once more when one ends
 * (flame/renderDrivers/createInteractiveRenderDriver.ts), in case an engine
 * presents the way WebKit does without being recognised as Apple WebKit.
 *
 * Where the API is missing, the update runs at once too.
 */
import { createSignal } from 'solid-js'
import { isAppleWebKit } from '@/utils/platform'

const [settled, setSettled] = createSignal(0)

/**
 * Counts view transitions that have ended: finished, skipped, or failed in
 * their update callback. Read it to react to the end of each one. An update
 * that ran with no transition is not counted.
 */
export const viewTransitionsSettled = settled

export function startViewTransition(update: () => void): void {
  if (!('startViewTransition' in document) || isAppleWebKit()) {
    update()
    return
  }
  const transition = document.startViewTransition(update)
  // A skipped transition rejects `ready`; the update still ran.
  transition.ready.catch(() => {})
  const done = () => {
    setSettled((count) => count + 1)
  }
  transition.finished.then(done, done)
}
