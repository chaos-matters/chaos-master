import { createSignal } from 'solid-js'

/**
 * Global, debounced "is the user actively scrolling" signal.
 *
 * Gating expensive live previews on this lets a gallery defer mounting their
 * WebGPU canvases until scrolling settles. Without it, fast/jerky scrolling
 * through a large gallery flickers hundreds of tiles through the viewport, each
 * allocating a preview canvas that is torn down before it can render/snapshot —
 * the abandoned buffers (freed only after pending GPU work completes) pile up and
 * balloon VRAM into the tens of GB, stalling the GPU. While scrolling we mount
 * nothing new; ~`SETTLE_MS` after the last scroll the visible window mounts and
 * renders (still throttled by the ComputeGate). Already-snapshotted previews keep
 * their static image throughout, so the gallery doesn't flash.
 */
const SETTLE_MS = 180

const [isScrolling, setIsScrolling] = createSignal(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined
let attached = false

function onScrollActivity() {
  setIsScrolling(true)
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => setIsScrolling(false), SETTLE_MS)
}

function ensureAttached() {
  if (attached) {
    return
  }
  attached = true
  // `scroll` doesn't bubble, so capture:true is needed to see scrolls in any
  // nested scroll container; `wheel`/`touchmove` catch the gesture even before
  // the first scroll event fires. All passive — we never preventDefault.
  window.addEventListener('scroll', onScrollActivity, {
    capture: true,
    passive: true,
  })
  window.addEventListener('wheel', onScrollActivity, { passive: true })
  window.addEventListener('touchmove', onScrollActivity, { passive: true })
}

/** Reactive accessor: `true` while the user is actively scrolling (debounced). */
export function useIsScrolling() {
  ensureAttached()
  return isScrolling
}
