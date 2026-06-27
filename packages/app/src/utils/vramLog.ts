import { createSignal } from 'solid-js'
import { DEBUG_VRAM } from '@/defaults'

export function vramLog(...args: unknown[]) {
  if (DEBUG_VRAM) {
    console.info('[VRAM]', ...args)
  }
}

// Running VRAM ledger. Call with a positive delta on allocation and the matching
// negative delta on free. Exposed as a signal so the DebugPanel can show live
// GPU-buffer usage without needing VITE_DEBUG_VRAM (no console spam) — the
// monotonic total climbing without ever dropping while scrolling the gallery is
// the single most diagnostic signal of a mount-accumulation / buffer leak.
// Updating the ledger is a cheap `+=` per alloc/free (not per frame); console
// tracing stays gated on DEBUG_VRAM.
const [trackedVramBytes, setTrackedVramBytes] = createSignal(0)
export { trackedVramBytes }

let _vramTotalBytes = 0

export function vramTrack(label: string, deltaBytes: number) {
  _vramTotalBytes += deltaBytes
  setTrackedVramBytes(_vramTotalBytes)
  if (DEBUG_VRAM) {
    const mib = (n: number) => (n / 1048576).toFixed(2)
    const sign = deltaBytes >= 0 ? '+' : ''
    console.info(
      '[VRAM]',
      `${sign}${mib(deltaBytes)}MiB`,
      label,
      '| total',
      `${mib(_vramTotalBytes)}MiB`,
    )
  }
}

// Count of live (mounted, GPU-allocated) gallery previews, exposed as a signal
// for the DebugPanel. Bounded to roughly the on-screen window by the galleries'
// visibility gating; a value that climbs with scroll distance signals a leak.
const [livePreviewCount, setLivePreviewCount] = createSignal(0)
export { livePreviewCount }

export function adjustLivePreviewCount(delta: number) {
  setLivePreviewCount((n) => n + delta)
}
