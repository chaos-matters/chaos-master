import { createSignal } from 'solid-js'

/**
 * Single source of truth for WebGPU availability across the whole session.
 *
 * Why a module-level signal (not a context): the device lifecycle lives in
 * module code (WebgpuAdapter.ts, the detached hardwareTier benchmark Root),
 * which has no Solid owner and cannot read a context — yet components
 * (Root, AutoCanvas, the status banner) must react to it. A module-level
 * `createSignal` is readable imperatively from module code AND subscribable
 * reactively from inside components, which is exactly what we need.
 *
 * States:
 *   uninitialized   no device requested yet
 *   initializing    a device request is in flight
 *   ready           a live device is available — the only state previews render in
 *   lost-recovering device was lost; the single per-session retry is running
 *   unavailable     device lost past the retry cap, or adapter/getContext failed —
 *                   TERMINAL for the session (reload-only recovery)
 *   unsupported     navigator.gpu is absent — TERMINAL
 */
export type GpuStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'lost-recovering'
  | 'unavailable'
  | 'unsupported'

const [gpuStatus, setGpuStatusInternal] =
  createSignal<GpuStatus>('uninitialized')

export { gpuStatus }

// Once the session is terminally down there is no in-app recovery (a retry on a
// just-OOM'd GPU only re-crashes it on the target hardware — recovery is by page
// reload). Latch these so nothing can flip the status back and re-enter init.
const TERMINAL_STATES: ReadonlySet<GpuStatus> = new Set<GpuStatus>([
  'unavailable',
  'unsupported',
])

export function setGpuStatus(next: GpuStatus) {
  if (TERMINAL_STATES.has(gpuStatus())) {
    return
  }
  setGpuStatusInternal(next)
}

/** The one reactive boolean every render-guard reads. */
export function gpuReady() {
  return gpuStatus() === 'ready'
}

/** True once WebGPU is terminally down for this session (reload to recover). */
export function isGpuTerminallyDown() {
  return TERMINAL_STATES.has(gpuStatus())
}

// Dev-only console hook to exercise the degraded shell + preview posters without
// a real device crash. In devtools run:  __chaosForceGpuUnavailable()
// Flips the session to the terminal 'unavailable' state: every live preview
// becomes a poster, render loops stop, and the rest of the studio stays usable.
// Stripped from production builds by import.meta.env.DEV dead-code elimination.
if (import.meta.env.DEV) {
  ;(
    globalThis as typeof globalThis & {
      __chaosForceGpuUnavailable?: () => void
    }
  ).__chaosForceGpuUnavailable = () => {
    setGpuStatus('unavailable')
  }
}
